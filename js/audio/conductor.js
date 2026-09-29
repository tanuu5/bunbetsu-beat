// 曲の時刻と、音の予約。時間の基準は AudioContext.currentTime の 1 つだけにする。
//
// 曲の時刻（秒）は「スピーカーから今まさに聞こえている音が、曲のどこか」を表す。
// 絵の位置も入力の判定も、すべてこの時刻で計算する。
// - getOutputTimestamp() が使えるとき：その contextTime は出力装置で鳴っている位置なので、
//   出力の遅れ（outputLatency）はすでに含まれている。
// - 使えないとき：currentTime と performance.now() の組から、outputLatency（なければ baseLatency）を引く。
// どちらも毎コマの値はがたつくので、なめらかにしてから使う。

import { CONFIG } from '../config.js';

export class Conductor {
  /** @param {{ mute?: boolean }} [opts] */
  constructor(opts = {}) {
    this.mute = !!opts.mute;
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {GainNode|null} 曲の音量 */
    this.musicBus = null;
    /** @type {GainNode|null} 効果音の音量 */
    this.sfxBus = null;
    this.songStartTime = 0; // 曲の時刻 0 にあたる context の時刻
    this.bpm = 120;
    this.spb = 0.5;
    this.userOffsetSec = 0; // 設定の「タイミング調整」
    this.playing = false;
    this.paused = false;
    this.frozenSongTime = 0;
    this.clockOffset = NaN; // 聞こえている context の時刻 − performance.now()/1000
    this.clockMethod = '';
    this.timer = 0;
    this.nextBeat = 0;
    this.endBeat = 0;
    /** @type {(beat: number, when: number) => void} */
    this.onScheduleBeat = () => {};
  }

  /**
   * 最初の操作（タップやキー）の中で呼ぶ。ここで AudioContext を作るか resume() して、鳴らせる状態にする。
   */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      const ctx = new AC({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 6;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      const master = ctx.createGain();
      master.gain.value = this.mute ? 0 : 1;
      const limiter = createSoftLimiter(ctx);
      master.connect(comp).connect(limiter.input);
      limiter.output.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(master);
      this.sfxBus.connect(master);
      this.ctx = ctx;
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    return this.ctx;
  }

  setVolumes(music, sfx) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [bus, v] of [[this.musicBus, music], [this.sfxBus, sfx]]) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(v, now);
    }
  }

  setUserOffsetMs(ms) {
    this.userOffsetSec = ms / 1000;
  }

  /**
   * 曲を始める。
   * @param {{ bpm: number, startBeat?: number, endBeat: number }} o
   */
  start({ bpm, startBeat = 0, endBeat }) {
    const ctx = this.unlock();
    this.stop();
    this.bpm = bpm;
    this.spb = 60 / bpm;
    this.songStartTime = ctx.currentTime + CONFIG.audio.startDelaySec - startBeat * this.spb;
    this.nextBeat = startBeat;
    this.endBeat = endBeat;
    this.playing = true;
    this.paused = false;
    this.clockOffset = NaN;
    this.sampleClock(performance.now());
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), CONFIG.audio.lookaheadMs);
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    this.playing = false;
    this.paused = false;
  }

  /** 25 ミリ秒ごとに呼ばれ、0.1 秒先までの拍を予約する。 */
  schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.playing || this.paused) return;
    const horizon = ctx.currentTime + CONFIG.audio.scheduleAheadSec;
    while (this.nextBeat < this.endBeat) {
      const when = this.songStartTime + this.nextBeat * this.spb;
      if (when >= horizon) break;
      this.onScheduleBeat(this.nextBeat, when); // 過ぎた音を鳴らさないのは、曲の側で音ごとに判断する
      this.nextBeat++;
    }
  }

  pause() {
    if (!this.playing || this.paused) return;
    this.frozenSongTime = this.songTimeAt(performance.now());
    this.paused = true;
    this.ctx?.suspend();
  }

  /** 止めていた音を再開する。currentTime も止まっていたので、曲の時刻はそのまま続く。 */
  async resume() {
    if (!this.paused) return;
    await this.ctx?.resume();
    this.clockOffset = NaN;
    this.paused = false;
    this.sampleClock(performance.now());
  }

  /** 毎コマ呼び、context の時計と performance.now() の対応を更新する。 */
  sampleClock(perfNowMs) {
    const ctx = this.ctx;
    if (!ctx || this.paused) return;
    let raw;
    const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
      raw = ts.contextTime - ts.performanceTime / 1000;
      this.clockMethod = 'outputTimestamp';
    } else {
      const latency = ctx.outputLatency || ctx.baseLatency || 0;
      raw = ctx.currentTime - latency - perfNowMs / 1000;
      this.clockMethod = 'latency';
    }
    const { clockResyncSec, clockSmoothing } = CONFIG.audio;
    if (!Number.isFinite(this.clockOffset) || Math.abs(raw - this.clockOffset) > clockResyncSec) this.clockOffset = raw;
    else this.clockOffset += (raw - this.clockOffset) * clockSmoothing;
  }

  /**
   * performance.now() と同じ基準の時刻（入力イベントの timeStamp など）を、曲の時刻に直す。
   * @param {number} perfMs
   */
  songTimeAt(perfMs) {
    if (this.paused) return this.frozenSongTime;
    if (!Number.isFinite(this.clockOffset)) return -Infinity;
    return perfMs / 1000 + this.clockOffset - this.songStartTime - this.userOffsetSec;
  }

  /** 画面の確認用の値。 */
  debugInfo() {
    const ctx = this.ctx;
    return {
      method: this.clockMethod,
      outputLatency: ctx?.outputLatency ?? NaN,
      baseLatency: ctx?.baseLatency ?? NaN,
      sampleRate: ctx?.sampleRate ?? NaN,
      state: ctx?.state ?? 'none',
    };
  }
}

/**
 * 割れる手前でやわらかく抑える。0.8 までは素通しで、そこから 1.0 へなめらかに近づける。
 * WaveShaper は入力を -1〜1 で受けるので、半分に下げて入れ、曲線の側で 2 倍に戻す。
 * @param {BaseAudioContext} ctx
 */
export function createSoftLimiter(ctx) {
  const pre = ctx.createGain();
  pre.gain.value = 0.5;
  const shaper = ctx.createWaveShaper();
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(x);
    const y = a <= 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2);
    curve[i] = Math.sign(x) * y;
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  pre.connect(shaper);
  return { input: pre, output: shaper };
}
