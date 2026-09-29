// 曲と効果音で共有する、音を作る小さな部品。

/** MIDI の音の高さを周波数に。 */
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * @param {BaseAudioContext} ctx
 */
export function createSynth(ctx) {
  // 雑音は最初に 1 回だけ作って使い回す
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.0), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  /**
   * 1 音。音の高さを freq から freqEnd へ動かせる。
   * @param {{ type?: OscillatorType, freq: number, freqEnd?: number, when: number, dur: number, gain: number,
   *           attack?: number, release?: number, sustain?: number, filter?: AudioNode|null, dest: AudioNode, detune?: number }} o
   *   sustain = 0 なら鳴らしてすぐ減っていく（打楽器ふう）。0 より大きければ dur のあいだ保ち、release で消える。
   */
  function tone(o) {
    const { type = 'sine', freq, freqEnd = freq, when, dur, gain, attack = 0.003, release = 0.05, sustain = 0, filter = null, dest, detune = 0 } = o;
    // サンプリング周波数の半分を超える高さは出せない（警告が出る）ので、鳴らさない
    if (Math.max(freq, freqEnd) >= ctx.sampleRate * 0.45) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, when);
    if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), when + dur);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(gain, when + attack);
    let end;
    if (sustain > 0) {
      env.gain.setValueAtTime(gain, when + Math.max(attack, dur - release));
      env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      end = when + dur;
    } else {
      env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      end = when + dur;
    }
    let node = osc.connect(env);
    if (filter) node = node.connect(filter);
    node.connect(dest);
    osc.start(when);
    osc.stop(end + 0.02);
  }

  /**
   * 帯域を絞った雑音。
   * @param {{ when: number, dur: number, gain: number, from: number, to?: number, q?: number,
   *           filterType?: BiquadFilterType, dest: AudioNode, attack?: number }} o
   */
  function hiss(o) {
    const { when, dur, gain, from, to = from, q = 1, filterType = 'bandpass', dest, attack = 0.002 } = o;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, when);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(to, when + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(gain, when + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f).connect(env).connect(dest);
    src.start(when, Math.random() * 0.5);
    src.stop(when + dur + 0.02);
  }

  return { tone, hiss };
}
