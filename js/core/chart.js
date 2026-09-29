// 譜面（流れてくる順番）を作る。同じ種・同じ難しさなら、必ず同じ譜面になる。

import { CONFIG } from '../config.js';
import { createRng } from './rng.js';

/**
 * @typedef {object} ChartItem
 * @property {number} id
 * @property {number} beat   目標の拍（曲の頭 = 0）
 * @property {number} time   目標時刻（秒、曲の時刻）
 * @property {import('../config.js').ItemType} type
 * @property {import('../config.js').Dir|null} dir 正解の方向。捨てないものは null
 * @property {string} kind   見た目の種類（banana など）
 * @property {number} phase
 */

/**
 * @typedef {object} Section
 * @property {string} id
 * @property {number} bars
 * @property {number} startBar
 * @property {number} startBeat
 * @property {number} endBeat
 * @property {number} [phase]
 * @property {string} [reveal]
 */

/** 曲の構成に、始まりの小節と拍を足して返す。 */
export function buildSections(config = CONFIG) {
  const bpb = config.beatsPerBar;
  let bar = 0;
  return config.structure.map((s) => {
    const sec = { ...s, startBar: bar, startBeat: bar * bpb, endBeat: (bar + s.bars) * bpb };
    bar += s.bars;
    return sec;
  });
}

/** 拍の位置にある区間を返す。範囲外なら最後の区間。 */
export function sectionAt(sections, beat) {
  for (const s of sections) if (beat < s.endBeat) return s;
  return sections[sections.length - 1];
}

/**
 * @param {{ seed: number, difficulty: import('../config.js').Difficulty, config?: typeof CONFIG }} opts
 */
export function buildChart({ seed, difficulty, config = CONFIG }) {
  const rng = createRng(seed);
  const diff = config.difficulties[difficulty];
  const spb = 60 / diff.bpm;
  const sections = buildSections(config);
  /** @type {ChartItem[]} */
  const items = [];
  const state = {
    run: { type: /** @type {string|null} */ (null), count: 0 },
    lastKind: /** @type {Record<string, string>} */ ({}),
  };

  let prevTypes = new Set();
  for (const sec of sections) {
    if (sec.id !== 'phase') continue;
    const types = config.phaseTypes[sec.phase];
    const newTypes = types.filter((t) => !prevTypes.has(t));
    items.push(...generatePhase(sec, types, newTypes, difficulty, config, rng, state));
    prevTypes = new Set(types);
  }

  items.forEach((it, i) => {
    it.id = i;
    it.time = it.beat * spb;
  });
  const totalBeats = sections[sections.length - 1].endBeat;
  return { seed, difficulty, bpm: diff.bpm, spb, sections, items, totalBeats, duration: totalBeats * spb };
}

/** 型の中に、前後が休みの 1 個（8 分音符の並びでないもの）があるか。小節の最後のマスは次の小節とつながりうるので数えない。 */
function hasSingleton(pattern) {
  for (let i = 0; i < pattern.length - 1; i++) {
    if (pattern[i] && !pattern[i - 1] && !pattern[i + 1]) return true;
  }
  return false;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generatePhase(sec, types, newTypes, difficulty, config, rng, state) {
  const bpb = config.beatsPerBar;
  const weights = config.patternWeights[difficulty][sec.phase];
  const keepIsNew = newTypes.includes('keep');

  // 1. 小節ごとにリズムの型を選ぶ
  /** @type {{ beat: number, bar: number }[]} */
  const notes = [];
  for (let b = 0; b < sec.bars; b++) {
    const needSingleton = b === 0 && keepIsNew;
    let pattern = null;
    for (let tries = 0; tries < 20 && !pattern; tries++) {
      const p = rng.pick(config.patterns[rng.weighted(weights)]);
      if (!needSingleton || hasSingleton(p)) pattern = p;
    }
    if (!pattern) {
      const all = Object.keys(weights).flatMap((k) => config.patterns[k]).filter(hasSingleton);
      if (all.length === 0) throw new Error('chart: 捨てないものを置ける型がない');
      pattern = rng.pick(all);
    }
    const step = bpb / pattern.length;
    pattern.forEach((on, slot) => {
      if (on) notes.push({ beat: sec.startBeat + b * bpb + slot * step, bar: b });
    });
  }

  // 2. 8 分音符で隣り合うものをまとめる
  const eighth = bpb / 8;
  /** @type {number[][]} */
  const clusters = [];
  notes.forEach((n, i) => {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(n.beat - notes[i - 1].beat - eighth) < 1e-9) last.push(i);
    else clusters.push([i]);
  });

  // 3. 捨てないものを置く（前後が休みの 1 個だけ。2 個続けない）
  const isKeep = new Array(notes.length).fill(false);
  if (types.includes('keep')) {
    const { keepRatioMin, keepRatioMax } = config.chartRules;
    const n = notes.length;
    const lo = Math.ceil(n * keepRatioMin - 1e-9);
    const hi = Math.floor(n * keepRatioMax + 1e-9);
    const target = lo <= hi ? lo + rng.int(hi - lo + 1) : Math.max(1, Math.round((n * (keepRatioMin + keepRatioMax)) / 2));
    const singles = clusters.filter((c) => c.length === 1).map((c) => c[0]);
    let placed = 0;
    const canPlace = (i) => !isKeep[i] && !isKeep[i - 1] && !isKeep[i + 1];
    if (keepIsNew) {
      const first = singles.filter((i) => notes[i].bar === 0);
      if (first.length === 0) throw new Error('chart: 最初の小節に捨てないものを置けない');
      isKeep[rng.pick(first)] = true;
      placed++;
    }
    for (const i of shuffle(singles.slice(), rng)) {
      if (placed >= target) break;
      if (!canPlace(i)) continue;
      isKeep[i] = true;
      placed++;
    }
  }

  // 4. 方向のある種類を割り当てる。やさしい・ふつうでは 8 分音符の並びを同じ種類にする
  const maxRun = config.chartRules.maxSameDirRun;
  const mixed = config.difficulties[difficulty].allowMixedEighths;
  /** @type {number[][]} */
  const units = [];
  for (const c of clusters) {
    const idx = c.filter((i) => !isKeep[i]);
    if (mixed) idx.forEach((i) => units.push([i]));
    else for (let k = 0; k < idx.length; k += maxRun) units.push(idx.slice(k, k + maxRun));
  }
  const dirTypes = types.filter((t) => t !== 'keep');
  const forced = newTypes.filter((t) => t !== 'keep');
  /** @type {(string|null)[]} */
  const assigned = new Array(notes.length).fill(null);
  units.forEach((u, ui) => {
    const run = state.run;
    let cands = dirTypes.filter((t) => !(t === run.type && run.count + u.length > maxRun));
    if (ui === 0 && forced.length) {
      const f = cands.filter((t) => forced.includes(t));
      if (f.length) cands = f;
    }
    if (cands.length === 0) cands = dirTypes;
    const type = rng.pick(cands);
    if (type === run.type) run.count += u.length;
    else {
      run.type = type;
      run.count = u.length;
    }
    u.forEach((i) => (assigned[i] = type));
  });

  // 5. 見た目の種類を選び、アイテムにする
  return notes.map((n, i) => {
    const type = isKeep[i] ? 'keep' : /** @type {string} */ (assigned[i]);
    const kinds = config.kinds[type];
    const choices = kinds.length > 1 ? kinds.filter((k) => k !== state.lastKind[type]) : kinds;
    const kind = rng.pick(choices);
    state.lastKind[type] = kind;
    return /** @type {ChartItem} */ ({
      id: -1,
      beat: n.beat,
      time: 0,
      type,
      dir: config.types[type].dir,
      kind,
      phase: sec.phase,
    });
  });
}
