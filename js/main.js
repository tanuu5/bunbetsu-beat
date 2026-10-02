// 起動、画面の切り替え、毎コマの処理。

import { CONFIG, judgeWindowsFor } from './config.js';
import { buildChart } from './core/chart.js';
import { createJudge } from './core/judge.js';
import { createScore } from './core/score.js';
import { seedFrom } from './core/rng.js';
import { Conductor } from './audio/conductor.js';
import { createMusic } from './audio/music.js';
import { createSfx } from './audio/sfx.js';
import { createScene, hasWebGL2 } from './view/scene.js';
import { createItems } from './view/items.js';
import { createBins } from './view/bins.js';
import { createRobot } from './view/robot.js';
import { createEffects } from './view/effects.js';
import { createCrowd } from './view/crowd.js';
import { drawFace, createFaceState } from './view/face.js';
import { ITEM_Y } from './view/layout.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';
import * as storage from './storage.js';
import { t } from './i18n.js';

// ---- URL に付けるもの（10.5） ----
const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const phaseParam = Number(params.get('phase'));
const opts = {
  seed: params.has('seed') && Number.isFinite(seedParam) ? seedParam >>> 0 : null,
  debug: params.get('debug') === '1',
  auto: params.get('auto') === '1',
  phase: Number.isInteger(phaseParam) && phaseParam >= 1 && phaseParam <= 4 ? phaseParam : 1,
  mute: params.get('mute') === '1',
  // 確認用：タブが裏に回っても一時停止しない（画面の見えない自動の確認で使う）
  noPause: params.get('nopause') === '1',
};

const ui = createUI();
const data = storage.load();
let difficulty = /** @type {import('./config.js').Difficulty} */ (CONFIG.defaultDifficulty);

if (!hasWebGL2()) {
  ui.fatal(t('noWebGL'));
  throw new Error('WebGL2 is not available');
}

// ---- 3D ----
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('gl'));
const view = createScene(canvas);
const bins = createBins(view.scene, view.camera);
const robot = createRobot(view.scene);
const effects = createEffects(view.scene);
const crowd = createCrowd(view.scene, robot.faceTexture);
const itemsView = createItems(view.scene, {
  onLand: (type, pos, now) => {
    bins.bump(type, now);
    effects.burst(pos, CONFIG.types[type].color);
  },
  onUnsorted: (pos) => effects.sigh(pos),
});

// 右下の小窓に出す、ソータの正面の顔
const faceState = createFaceState();
const faceWindow = /** @type {HTMLCanvasElement} */ (document.getElementById('face-canvas'));
const faceWindowCtx = /** @type {CanvasRenderingContext2D} */ (faceWindow.getContext('2d'));
let faceWindowExpr = '';
let faceWindowAt = -Infinity;

// 動きを減らす（設定、または端末の設定）
const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const reduceMotion = () => data.settings.reduceMotion || !!prefersReduced?.matches;

function onResize() {
  view.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
// 画面を回した直後は、resize の時点で大きさがまだ変わっていないことがあるので、向きの変化でも合わせ直す
screen.orientation?.addEventListener('change', () => setTimeout(onResize, 50));
window.visualViewport?.addEventListener('resize', onResize);
onResize();

// ---- 音 ----
const conductor = new Conductor({ mute: opts.mute });
conductor.setUserOffsetMs(data.settings.timingOffsetMs);

// ---- 状態 ----
/** @type {'title'|'howto'|'settings'|'play'|'paused'|'resuming'|'ending'|'result'} */
let mode = 'title';
/** @type {any} */
let game = null;
/** @type {ReturnType<typeof createSfx>|null} */
let sfx = null;
const BIN_TYPES = /** @type {const} */ (['burn', 'plastic', 'can', 'pet']);
const RANK_ORDER = ['C', 'B', 'A', 'S'];
const dbg = { frames: 0, fps: 60, lastFrame: 0, lastDelta: NaN, lastKind: '', beatDeltas: /** @type {number[]} */ ([]) };

// ---- 入力 ----
const input = createInput({
  surface: /** @type {HTMLElement} */ (document.getElementById('stage')),
  onDir: (dir, timeMs) => handleDir(dir, timeMs),
  onTap: (x, y, timeMs) => {
    const hit = view.pick(x, y, bins.hitMeshes).find((h) => bins.isVisible(h.object.userData.type));
    if (hit) handleDir(hit.object.userData.dir, timeMs);
  },
  onConfirm: () => {
    if (mode === 'title' || mode === 'result') startGame();
    else if (mode === 'paused') resumeGame();
    else if (mode === 'howto') closeHowto();
  },
  onPause: () => {
    if (mode === 'play') pauseGame();
    else if (mode === 'paused') resumeGame();
    else if (mode === 'howto') closeHowto();
    else if (mode === 'settings') closeSettings();
  },
  onNav: (dir) => {
    // タイトルでは ← → で難しさを選ぶ
    if (mode !== 'title' || (dir !== 'left' && dir !== 'right')) return;
    const list = Object.keys(CONFIG.difficulties);
    const i = list.indexOf(difficulty) + (dir === 'left' ? -1 : 1);
    if (i >= 0 && i < list.length) selectDifficulty(/** @type {any} */ (list[i]));
  },
  // 音の準備は、ブラウザが「ユーザーの操作」と認めるクリックと開始の操作の中だけで行う
  // （スマホでは指を置いた瞬間は操作と認められず、コンソールに警告が出るため）
});

/** 最初の操作の中で、音を鳴らせる状態にする（ボタンの音などのため）。 */
function ensureAudio() {
  try {
    const ctx = conductor.unlock();
    sfx ??= createSfx(ctx, conductor.sfxBus);
    if (!game) conductor.setVolumes(data.settings.musicVolume, data.settings.sfxVolume);
  } catch {
    /* 音が使えない環境でも、遊びは止めない */
  }
}

/** 方向の入力を、その場で判定する。 */
function handleDir(dir, timeMs) {
  if (mode !== 'play' || !game || game.ended) return;
  const st = conductor.songTimeAt(timeMs);
  if (opts.debug) {
    const spb = game.chart.spb;
    const bd = st - Math.round(st / spb) * spb;
    dbg.beatDeltas.push(bd);
    if (dbg.beatDeltas.length > 8) dbg.beatDeltas.shift();
  }
  handleEvents(game.judge.input(dir, st), st);
}

/** @param {import('./core/judge.js').JudgeEvent[]} events */
function handleEvents(events, now) {
  for (const ev of events) {
    const r = game.score.apply(ev);
    itemsView.onJudge(ev, now);
    if (ev.delta !== undefined) {
      dbg.lastDelta = ev.delta;
      dbg.lastKind = ev.kind;
    }
    if (ev.kind === 'empty') {
      robot.whiff(now);
      sfx?.whiff();
      continue;
    }
    popJudge(ev.kind);
    if (ev.kind === 'perfect' || ev.kind === 'good') {
      robot.throwTo(ev.item.dir, now);
      crowd.react('perfect', now);
      faceState.set(ev.kind === 'perfect' ? 'smile' : 'nod', now);
      sfx?.hit(ev.item.type, ev.kind === 'perfect', game.music.chordAt(now / game.chart.spb));
      vibrate(CONFIG.vibration.successMs);
    } else if (ev.kind === 'safe') {
      robot.wave(now);
      crowd.react('safe', now);
      faceState.set('relief', now);
      sfx?.safe(ev.item.kind);
    } else if (ev.kind === 'miss') {
      if (ev.reason === 'touched') robot.letGo(now);
      else if (ev.reason === 'wrong') robot.miss(now);
      if (ev.reason === 'wrong') bins.flash(ev.item.type, now);
      faceState.set('panic', now);
      crowd.react('miss', now);
      view.shake(now);
      sfx?.miss();
      vibrate(CONFIG.vibration.missMs);
    }
    if (r.comboMilestone) {
      effects.ring(now);
      robot.turn(now);
    }
    if (r.feverStarted) {
      sfx?.fever();
      game.flash = { text: t('fever'), until: now + 2 * game.chart.spb };
    }
    if (r.gameOver) {
      endGame('gameover');
      return;
    }
  }
}

function popJudge(kind) {
  const p = view.project(0, ITEM_Y + 1.4, 0);
  ui.showJudge(kind, p.x, p.y);
}

function vibrate(ms) {
  if (!data.settings.vibration || opts.auto) return;
  // ユーザーがまだ一度も操作していないと、ブラウザが呼び出しを止めてコンソールにエラーを出すので呼ばない
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  if (typeof navigator.vibrate === 'function') navigator.vibrate(ms);
}

// ---- 流れ ----
function startGame() {
  ensureAudio(); // 最初の操作の中で、音を鳴らせる状態にする
  const seed = opts.seed ?? seedFrom(Date.now());
  const chart = buildChart({ seed, difficulty });
  const bpb = CONFIG.beatsPerBar;
  const phaseSec = chart.sections.find((s) => s.id === 'phase' && s.phase === opts.phase);
  const startBeat = opts.phase === 1 ? 0 : phaseSec.startBeat - 2 * bpb; // 途中からでも 2 小節数える
  const items = chart.items.filter((it) => it.phase >= opts.phase).map((it, i) => ({ ...it, id: i }));
  const music = createMusic(conductor.ctx, conductor.musicBus, chart.sections, {
    spb: chart.spb,
    isFever: (songTime) => !!game && game.music === music && game.score.isFever(songTime),
  });
  conductor.onScheduleBeat = (beat, when) => music.scheduleBeat(beat, when);
  applySettings();

  game = {
    chart,
    music,
    items,
    startBeat,
    difficulty,
    judge: createJudge(items, judgeWindowsFor(difficulty)),
    score: createScore({ difficulty, spb: chart.spb, totalItems: items.length }),
    autoIndex: 0,
    ended: false,
    endAt: 0,
    freezeAt: 0,
    endReason: 'clear',
    /** @type {{ text: string, until: number }|null} */
    flash: null,
    /** @type {Set<string>} */
    revealed: new Set(),
  };
  // 最初から置いておくゴミ箱と、切り替えの小節で降りてくるゴミ箱
  for (const type of BIN_TYPES) {
    const sec = chart.sections.find((s) => s.reveal === type);
    const shown = CONFIG.phaseTypes[opts.phase].includes(type) || !sec;
    bins.setAppearTime(type, shown ? -Infinity : sec.startBeat * chart.spb);
    if (shown) game.revealed.add(type);
  }
  robot.reset();
  robot.setMode('play');
  bins.reset();
  effects.clear();
  faceState.reset();
  // 見物の仲間：カウントの 2 小節目に 1 組目、各切り替えの小節で 1 組ずつ集まる
  crowd.reset();
  crowd.setMode('play');
  crowd.setArrivals([
    opts.phase === 1 ? (startBeat + bpb) * chart.spb : -Infinity,
    ...['can', 'pet', 'keep'].map((reveal, k) => {
      const sec = chart.sections.find((s) => s.reveal === reveal);
      return opts.phase >= k + 2 ? -Infinity : sec.startBeat * chart.spb;
    }),
  ]);
  game.endingBeat = chart.sections.find((s) => s.id === 'ending').startBeat;
  dbg.beatDeltas.length = 0;
  dbg.lastDelta = NaN;
  const diffCfg = CONFIG.difficulties[difficulty];
  itemsView.reset(items, CONFIG.approachBeats * chart.spb, {
    gateSec: CONFIG.scanGateBeats * chart.spb,
    assist: (item) => diffCfg.assistPhases.includes(item.phase),
  });
  game.showNames = diffCfg.showNames;
  ui.hideOverlays();
  ui.setBanner('');
  conductor.start({ bpm: chart.bpm, startBeat, endBeat: chart.totalBeats });
  input.setEnabled(true);
  mode = 'play';
}

function pauseGame() {
  if (mode !== 'play') return;
  conductor.pause();
  input.setEnabled(false);
  mode = 'paused';
  ui.show('pause');
}

/** 3 拍数えてから動かす。 */
function resumeGame() {
  if (mode !== 'paused') return;
  mode = 'resuming';
  ui.hideOverlays();
  const beatMs = game.chart.spb * 1000;
  let n = 3;
  const tick = () => {
    if (mode !== 'resuming') return;
    if (n === 0) {
      ui.setBanner('');
      conductor.resume().then(() => {
        if (mode !== 'resuming') return;
        mode = 'play';
        input.setEnabled(true);
      });
      return;
    }
    ui.setBanner(String(n));
    n--;
    setTimeout(tick, beatMs);
  };
  tick();
}

/**
 * 曲の終わり、またはエコゲージが 0 になったとき。ゲージが 0 なら曲を止め、少し見せてから結果へ。
 * @param {'clear'|'gameover'} reason
 */
function endGame(reason) {
  if (!game || game.ended) return;
  game.ended = true;
  game.endReason = reason;
  input.setEnabled(false);
  if (reason === 'gameover') {
    game.freezeAt = conductor.songTimeAt(performance.now());
    conductor.stop();
    conductor.musicBus?.gain.setTargetAtTime(0, conductor.ctx.currentTime, 0.05); // 予約ずみの音も消す
    robot.miss(game.freezeAt);
    faceState.set('panic', game.freezeAt);
    crowd.react('miss', game.freezeAt);
    ui.setBanner(t('gameOver'));
    mode = 'ending';
    game.endStart = performance.now();
    game.endAt = game.endStart + 1600;
  } else {
    conductor.stop();
    showResult();
  }
}

function showResult() {
  mode = 'result';
  const r = game.score.result();
  const d = game.difficulty;
  // 自動プレイと、途中の段階から始めたときは保存しない
  const record = !opts.auto && opts.phase === 1;
  const newRecord = record && r.score > data.highScore[d];
  if (record) {
    if (newRecord) data.highScore[d] = r.score;
    const best = data.bestRank[d];
    if (best === null || RANK_ORDER.indexOf(r.rank) > RANK_ORDER.indexOf(best)) data.bestRank[d] = r.rank;
    storage.save(data);
  }
  ui.setBanner('');
  ui.beginLabels();
  ui.endLabels();
  game.result = r;
  ui.showResult(r, game.endReason, { newRecord, highScore: data.highScore[d] });
  const happy = game.endReason === 'clear' && (r.rank === 'S' || r.rank === 'A');
  robot.setMode(happy ? 'happy' : 'sad');
  crowd.setMode(happy ? 'happy' : 'sad');
  sfx?.rank(r.rank);
}

function applySettings() {
  conductor.setVolumes(data.settings.musicVolume, data.settings.sfxVolume);
  conductor.setUserOffsetMs(data.settings.timingOffsetMs);
  storage.save(data);
}

function toTitle() {
  conductor.stop();
  game = null;
  robot.setMode('title');
  crowd.setMode('hidden');
  effects.clear();
  itemsView.clear(); // タイトルではベルトだけを流す。前のゲームのゴミを残さない
  for (const type of BIN_TYPES) bins.setAppearTime(type, -Infinity);
  ui.beginLabels();
  ui.endLabels();
  input.setEnabled(false);
  showTitle();
}

function showTitle() {
  mode = 'title';
  ui.setBanner('');
  ui.setTitleRecord(data.highScore[difficulty], data.bestRank[difficulty]);
  ui.show('title');
}

function selectDifficulty(d) {
  difficulty = d;
  ui.markDifficulty(d);
  ui.setTitleRecord(data.highScore[d], data.bestRank[d]);
}

// ---- あそびかた・せってい・シェア ----
function openHowto() {
  mode = 'howto';
  ui.show('howto');
}

function closeHowto() {
  if (mode !== 'howto') return;
  if (!data.tutorialSeen) {
    data.tutorialSeen = true;
    storage.save(data);
  }
  showTitle();
}

function openSettings() {
  mode = 'settings';
  ui.show('settings');
}

function closeSettings() {
  if (mode !== 'settings') return;
  showTitle();
}

/** 題名・評価・得点・ページの URL だけを送る。Web Share API がなければ、クリップボードへ写す。 */
async function shareResult() {
  const r = game?.result;
  if (!r) return;
  const url = location.origin + location.pathname;
  const text = t('shareText', { title: t('title'), rank: r.rank, score: r.score.toLocaleString('ja-JP') });
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: t('title'), text, url });
      return;
    } catch (e) {
      if (/** @type {any} */ (e)?.name === 'AbortError') return; // 自分で閉じた
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    ui.toast(t('copied'));
  } catch {
    ui.toast(t('shareFailed'));
  }
}

// ---- ボタン ----
ui.buildDifficulty(difficulty, selectDifficulty);
ui.bindSettings(data.settings, applySettings);
// ボタンの「ぽん」（音を鳴らせる状態になってから）
document.addEventListener('click', (e) => {
  if (!(e.target instanceof HTMLButtonElement)) return;
  ensureAudio();
  if (e.target.id !== 'pause-btn') sfx?.button();
});
document.getElementById('howto-btn').addEventListener('click', openHowto);
document.getElementById('howto').addEventListener('click', closeHowto); // 1 タップで閉じる
document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', closeSettings);
document.getElementById('share-btn').addEventListener('click', shareResult);
// iPhone の Safari で、2 本指の拡大とダブルタップの拡大を止める
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('again-btn').addEventListener('click', startGame);
document.getElementById('pause-btn').addEventListener('click', () => pauseGame());
document.getElementById('resume-btn').addEventListener('click', resumeGame);
document.getElementById('retry-btn').addEventListener('click', startGame);
document.getElementById('title-btn').addEventListener('click', toTitle);
document.getElementById('result-title-btn').addEventListener('click', toTitle);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' || opts.noPause) return;
  if (mode === 'play') pauseGame();
  else if (mode === 'resuming') {
    mode = 'play';
    pauseGame();
  }
});

// ---- 毎コマ ----
function updateBanner(songTime) {
  const chart = game.chart;
  const beat = songTime / chart.spb;
  const bpb = CONFIG.beatsPerBar;
  const rel = beat - game.startBeat;
  if (game.flash && songTime < game.flash.until) return ui.setBanner(game.flash.text);
  if (rel < 0) return ui.setBanner('');
  if (rel < bpb) return ui.setBanner(t('ready'));
  if (rel < 2 * bpb) return ui.setBanner(String(2 * bpb - Math.floor(rel)));
  const sec = chart.sections.find((s) => beat >= s.startBeat && beat < s.endBeat);
  if (sec?.id === 'switch') {
    if (!game.revealed.has(sec.reveal)) {
      game.revealed.add(sec.reveal);
      if (sec.reveal !== 'keep') sfx?.binAppear();
    }
    if (sec.reveal === 'keep') return ui.setBanner(`${t('types.keep')}<small>${t('keepNotice')}</small>`);
    const dir = CONFIG.types[sec.reveal].dir;
    return ui.setBanner(`${t(`dirArrow.${dir}`)} ${t(`types.${sec.reveal}`)}`);
  }
  ui.setBanner('');
}

function autoPlay(songTime) {
  const items = game.items;
  while (game.autoIndex < items.length && items[game.autoIndex].time <= songTime) {
    const it = items[game.autoIndex++];
    // 入力した時刻（＝目標時刻）を動きの起点にする。描画が遅れても、判定位置から投げ始める
    if (it.dir && !game.judge.isJudged(it.id)) handleEvents(game.judge.input(it.dir, it.time), it.time);
    if (game.ended) return;
  }
}

view.renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = dbg.lastFrame ? now - dbg.lastFrame : 16.7;
  dbg.lastFrame = now;
  dbg.frames++;
  dbg.fps += (1000 / Math.max(dt, 1) - dbg.fps) * 0.05;

  conductor.sampleClock(now);
  let songTime = -1;
  let beatPulse = 0;
  let beat = 0;
  let fever = false;
  let low = false;

  if (game) {
    // ゲームオーバーのあとは、ベルトの上の世界の時刻を止める（ゴミの排出・ゴミ箱・仲間の登場が止まる）
    const frozen = game.ended && game.endReason === 'gameover';
    songTime = frozen ? game.freezeAt : conductor.songTimeAt(now);
    if (!Number.isFinite(songTime)) songTime = game.startBeat * game.chart.spb - 1;
    if (mode === 'ending' && now >= game.endAt) showResult();
    if (mode === 'play') {
      input.update(now);
      if (opts.auto) autoPlay(songTime);
      // フリックかタップか決まっていない指があるあいだは、その時刻より先の見逃しを確定しない
      const pending = input.earliestPending();
      const judgeTime = pending === null ? songTime : Math.min(songTime, conductor.songTimeAt(pending));
      if (!game.ended) handleEvents(game.judge.update(judgeTime), songTime);
      if (!game.ended && songTime >= game.chart.duration) endGame('clear');
    }
    if (mode === 'play') updateBanner(songTime);
    beat = songTime / game.chart.spb;
    if (beat >= game.startBeat) beatPulse = Math.pow(1 - (beat - Math.floor(beat)), 3);
    fever = game.score.isFever(songTime);
    low = game.score.state.gauge <= CONFIG.gauge.lowWarn;
    itemsView.update(songTime);
    ui.beginLabels();
    if (game.showNames && (mode === 'play' || mode === 'paused')) {
      itemsView.eachScanned(songTime, (item, pos) => {
        const p = view.project(pos.x, pos.y + 0.5, pos.z);
        const arrow = item.dir ? `${t(`dirArrow.${item.dir}`)} ` : '';
        ui.placeLabel(`${arrow}${t(`kinds.${item.kind}`)}`, CONFIG.types[item.type].color, p.x, p.y);
      });
    }
    ui.endLabels();
    const s = game.score.state;
    ui.setHud({
      score: s.score,
      combo: s.combo,
      multiplier: Math.min(CONFIG.score.multiplierMax, 1 + CONFIG.score.multiplierStep * Math.floor(s.combo / CONFIG.score.multiplierEvery)),
      fever,
      gauge: s.gauge,
    });
  }

  // 終了の演出のあいだは、ゴミは止めてロボットとゴミ箱だけ動かす
  // ゲームオーバーのあとも、ソータと仲間の身ぶりは動かし続ける
  const animTime = !game ? now / 1000 : game.ended && game.endReason === 'gameover' ? game.freezeAt + (now - game.endStart) / 1000 : songTime;
  const rm = reduceMotion();
  feverAmount += ((fever ? 1 : 0) - feverAmount) * Math.min(1, (dt / 1000) * 2);
  const expr = mode === 'play' || mode === 'paused' || mode === 'resuming' || mode === 'ending' ? faceState.get(animTime, { fever, low }) : 'smile';
  view.update({
    now: animTime,
    pulse: beatPulse,
    fever: feverAmount,
    beltOffset: game ? itemsView.beltOffset(songTime) : now / 1000,
    scan: game ? itemsView.scanPhase(songTime) : -1,
    reduceMotion: rm,
  });
  bins.update(game ? songTime : animTime, beatPulse);
  robot.update(animTime, { beat, pulse: beatPulse, fever, expr, reduceMotion: rm });
  effects.update(animTime, { fever, reduceMotion: rm });
  crowd.update(animTime, { worldTime: game ? songTime : animTime, beat, pulse: beatPulse, fever, ending: !!game && beat >= game.endingBeat, reduceMotion: rm });
  view.render();
  // 小窓の顔：変わったとき、動く表情なら 1 秒に 20 回まで描き直す
  if (expr !== faceWindowExpr || Math.abs(animTime - faceWindowAt) > 0.05) {
    drawFace(faceWindowCtx, faceWindow.width, expr, animTime);
    faceWindowExpr = expr;
    faceWindowAt = animTime;
  }
  adaptQuality(now, dt);

  if (opts.debug) ui.setDebug(debugText(songTime));
});

// コマ落ちが続くときは、画面の細かさを 2 → 1.5 → 1 と下げる
let feverAmount = 0;
let slowSince = -1;
function adaptQuality(now, dt) {
  if (mode !== 'play' || document.visibilityState !== 'visible' || dt > 250) {
    slowSince = -1;
    return;
  }
  const slow = dbg.fps < 50;
  if (!slow) slowSince = -1;
  else if (slowSince < 0) slowSince = now;
  else if (now - slowSince > 3000 && view.pixelRatio > 1) {
    view.setPixelRatio(view.pixelRatio > 1.5 ? 1.5 : 1);
    slowSince = -1;
    dbg.fps = 60;
  }
}

function debugText(songTime) {
  const ms = (s) => (Number.isFinite(s) ? `${s >= 0 ? '+' : ''}${(s * 1000).toFixed(1)}ms` : '-');
  const bd = dbg.beatDeltas;
  const mean = bd.length ? bd.reduce((a, b) => a + b, 0) / bd.length : NaN;
  const sd = bd.length > 1 ? Math.sqrt(bd.reduce((a, b) => a + (b - mean) ** 2, 0) / (bd.length - 1)) : NaN;
  const info = conductor.debugInfo();
  const r = view.renderer.info.render;
  return [
    `frame ${dbg.frames}  fps ${dbg.fps.toFixed(1)}  dpr ${view.pixelRatio}`,
    `song ${songTime.toFixed(3)}s  beat ${game ? (songTime / game.chart.spb).toFixed(2) : '-'}`,
    `input Δ(item) ${ms(dbg.lastDelta)} ${dbg.lastKind}`,
    `input Δ(beat) last ${ms(bd[bd.length - 1])}  avg${bd.length} ${ms(mean)}  sd ${ms(sd)}`,
    `draw ${r.calls}  tris ${r.triangles}`,
    `clock ${info.method}  out ${ms(info.outputLatency)}  base ${ms(info.baseLatency)}  ${info.state}`,
    `offset ${data.settings.timingOffsetMs}ms  seed ${game?.chart.seed ?? '-'}  ${game?.difficulty ?? difficulty}${opts.auto ? '  AUTO' : ''}${opts.mute ? '  MUTE' : ''}`,
  ].join('\n');
}

if (opts.debug) {
  document.getElementById('debug').hidden = false;
  // 確認用：ブラウザの開発ツールから中を見られるようにする
  /** @type {any} */ (window).__bb = { view, bins, robot, itemsView, effects, crowd, conductor, get game() { return game; } };
}
showTitle();
if (!data.tutorialSeen) openHowto(); // 初回だけ自動で表示
