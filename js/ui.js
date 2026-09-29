// 上部の表示と各画面（HTML）。3D の画面の上に重ねる。

import { t } from './i18n.js';
import { CONFIG } from './config.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

export function createUI() {
  const el = {
    hud: $('hud'),
    score: $('score'),
    combo: $('combo'),
    gauge: $('gauge'),
    gaugeFill: $('gauge-fill'),
    judge: $('judge-pop'),
    banner: $('banner'),
    debug: $('debug'),
    title: $('title'),
    pause: $('pause'),
    result: $('result'),
    fatal: $('fatal'),
    howto: $('howto'),
    settings: $('settings'),
    diffSelect: $('diff-select'),
  };
  const SCREENS = /** @type {const} */ (['title', 'pause', 'result', 'fatal', 'howto', 'settings']);
  // 画面を開いたとき、最初に選ばれているボタン（キーボードだけで操作できるように）
  const FOCUS = { title: 'start-btn', pause: 'resume-btn', result: 'again-btn', settings: 'settings-close', howto: 'howto' };
  $('howto').tabIndex = -1;
  let toastTimer = 0;

  // 文章を i18n から入れる
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = t(node.getAttribute('data-t'));
  document.title = t('title');

  // 手助けの名前は、最初に作って使い回す
  const labelLayer = $('labels');
  /** @type {HTMLElement[]} */
  const labels = [];
  for (let i = 0; i < 10; i++) {
    const d = document.createElement('div');
    d.className = 'item-label';
    d.hidden = true;
    labelLayer.append(d);
    labels.push(d);
  }
  let labelsUsed = 0;
  let labelsShown = 0;

  let lastScore = -1;
  let lastCombo = '';
  let lastGauge = -1;
  let lastBanner = '';

  return {
    el,

    /** 難しさのボタンを作る。 */
    buildDifficulty(selected, onSelect) {
      el.diffSelect.textContent = '';
      for (const d of Object.keys(CONFIG.difficulties)) {
        const b = document.createElement('button');
        b.className = 'diff-btn';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(d === selected));
        b.dataset.diff = d;
        b.textContent = t(`difficulty.${d}`);
        b.addEventListener('click', () => onSelect(d));
        el.diffSelect.append(b);
      }
    },
    markDifficulty(selected) {
      for (const b of el.diffSelect.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.diff === selected));
    },

    /** @param {typeof SCREENS[number]} name */
    show(name) {
      for (const n of SCREENS) el[n].hidden = n !== name;
      el.hud.hidden = name !== 'pause'; // 結果の画面では、得点が画面の中にそろっているので上部の表示を隠す
      $('face-window').hidden = el.hud.hidden;
      // 設定の部品は、一時停止と「せってい」の画面で使い回す
      if (name === 'settings') $('settings-slot').append($('settings-panel'));
      if (name === 'pause') $('pause-slot').append($('settings-panel'));
      const focus = FOCUS[name];
      if (focus) $(focus).focus({ preventScroll: true });
    },
    hideOverlays() {
      for (const n of SCREENS) el[n].hidden = true;
      el.hud.hidden = false;
      $('face-window').hidden = false;
    },

    /** タイトルに、選んでいる難しさの最高得点と最高評価を出す。 */
    setTitleRecord(score, rank) {
      $('title-record').textContent =
        rank === null ? t('noRecord') : `${t('bestRecord', { score: score.toLocaleString('ja-JP') })}　${t('bestRank', { rank })}`;
    },

    /** 画面の下に短い知らせを出す。 */
    toast(msg) {
      const e = $('toast');
      e.textContent = msg;
      e.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => e.classList.remove('show'), 1800);
    },

    fatal(msg) {
      $('fatal-msg').textContent = msg;
      this.show('fatal');
    },

    setHud({ score, combo, multiplier, fever, gauge }) {
      if (score !== lastScore) {
        el.score.textContent = score.toLocaleString('ja-JP');
        lastScore = score;
      }
      const c = combo >= 2 ? `${combo} ${t('combo')} ×${multiplier.toFixed(1)}${fever ? ' FEVER!' : ''}` : '';
      if (c !== lastCombo) {
        el.combo.textContent = c;
        lastCombo = c;
      }
      if (gauge !== lastGauge) {
        el.gaugeFill.style.width = `${gauge}%`;
        el.gauge.classList.toggle('low', gauge <= CONFIG.gauge.lowWarn);
        lastGauge = gauge;
      }
    },

    /** 判定の文字を、判定位置の少し上に 0.4 秒だけ出す。 */
    showJudge(kind, x, y) {
      const j = el.judge;
      j.className = 'judge';
      void j.offsetWidth; // アニメーションをやり直す
      j.textContent = t(`judge.${kind}`);
      j.style.left = `${x}px`;
      j.style.top = `${y}px`;
      j.classList.add('show', kind);
    },

    setBanner(html) {
      if (html === lastBanner) return;
      el.banner.innerHTML = html;
      lastBanner = html;
    },

    setDebug(text) {
      el.debug.textContent = text;
    },

    /** 毎コマのはじめに呼ぶ。 */
    beginLabels() {
      labelsUsed = 0;
    },
    /** 手助けの名前を 1 つ置く。 */
    placeLabel(text, color, x, y) {
      if (labelsUsed >= labels.length) return;
      const d = labels[labelsUsed++];
      if (d.textContent !== text) d.textContent = text;
      d.style.color = color;
      d.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      d.hidden = false;
    },
    /** 毎コマのおわりに呼ぶ。使わなかった名前を隠す。 */
    endLabels() {
      for (let i = labelsUsed; i < labelsShown; i++) labels[i].hidden = true;
      labelsShown = labelsUsed;
    },

    /**
     * @param {ReturnType<ReturnType<typeof import('./core/score.js').createScore>['result']>} r
     * @param {'clear'|'gameover'} reason
     * @param {{ newRecord: boolean, highScore: number }} rec
     */
    showResult(r, reason, rec) {
      $('result-head').textContent = reason === 'gameover' ? t('gameOver') : t('clear');
      $('result-rank').textContent = r.rank;
      $('result-title').textContent = r.perfectTitle ? t('perfectTitle') : '';
      $('result-record').textContent = rec.newRecord ? t('newRecord') : '';
      const rows = [
        [t('stats.score'), r.score.toLocaleString('ja-JP')],
        [t('highScore'), rec.highScore.toLocaleString('ja-JP')],
        [t('stats.accuracy'), `${(r.accuracy * 100).toFixed(1)}%`],
        [t('stats.perfect'), r.counts.perfect + r.counts.safe],
        [t('stats.good'), r.counts.good],
        [t('stats.miss'), r.counts.miss],
        [t('stats.maxCombo'), r.maxCombo],
      ];
      const sub = Object.keys(CONFIG.types)
        .filter((type) => type in r.typeAccuracy)
        .map((type) => [t(`types.${type}`), `${Math.round(r.typeAccuracy[type] * 100)}%`, true]);
      const dl = $('result-stats');
      dl.textContent = '';
      for (const [k, v, isSub] of [...rows, ...sub]) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = String(v);
        if (isSub) dt.className = dd.className = 'sub';
        dl.append(dt, dd);
      }
      const w = r.weakestType;
      $('result-comment').textContent = w === null ? t('allGood') : w === 'keep' ? t('weakKeep') : t('weak', { type: t(`types.${w}`) });
      this.show('result');
    },

    /**
     * 設定の部品（音量、タイミング調整、振動、動きを減らす）をつなぐ。
     * @param {{ musicVolume: number, sfxVolume: number, timingOffsetMs: number, vibration: boolean, reduceMotion: boolean }} settings
     * @param {() => void} onChange
     */
    bindSettings(settings, onChange) {
      const music = /** @type {HTMLInputElement} */ ($('vol-music'));
      const sfx = /** @type {HTMLInputElement} */ ($('vol-sfx'));
      const out = $('offset-val');
      const vib = /** @type {HTMLInputElement} */ ($('opt-vibration'));
      const reduce = /** @type {HTMLInputElement} */ ($('opt-reduce'));
      const { min, max, step } = CONFIG.timingOffset;
      const render = () => {
        music.value = String(settings.musicVolume);
        sfx.value = String(settings.sfxVolume);
        const v = settings.timingOffsetMs;
        out.textContent = `${v > 0 ? '+' : ''}${v} ms`;
        vib.checked = settings.vibration;
        reduce.checked = settings.reduceMotion;
      };
      vib.addEventListener('change', () => {
        settings.vibration = vib.checked;
        onChange();
      });
      reduce.addEventListener('change', () => {
        settings.reduceMotion = reduce.checked;
        onChange();
      });
      music.addEventListener('input', () => {
        settings.musicVolume = Number(music.value);
        onChange();
      });
      sfx.addEventListener('input', () => {
        settings.sfxVolume = Number(sfx.value);
        onChange();
      });
      const nudge = (d) => {
        settings.timingOffsetMs = Math.max(min, Math.min(max, settings.timingOffsetMs + d));
        render();
        onChange();
      };
      $('offset-minus').addEventListener('click', () => nudge(-step));
      $('offset-plus').addEventListener('click', () => nudge(step));
      render();
    },
  };
}
