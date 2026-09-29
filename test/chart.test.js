import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChart, buildSections } from '../js/core/chart.js';
import { CONFIG } from '../js/config.js';

const DIFFS = ['easy', 'normal', 'hard'];
const SEEDS = Array.from({ length: 150 }, (_, i) => i * 7919 + 1);

test('曲の構成は 47 小節で、BPM 120 なら約 94 秒', () => {
  const secs = buildSections();
  assert.equal(secs[secs.length - 1].endBeat, 47 * 4);
  const chart = buildChart({ seed: 1, difficulty: 'normal' });
  assert.equal(chart.duration, 94);
});

test('同じ種なら同じ譜面、違う種なら違う譜面', () => {
  for (const difficulty of DIFFS) {
    const a = buildChart({ seed: 12345, difficulty });
    const b = buildChart({ seed: 12345, difficulty });
    assert.deepEqual(a, b);
    const c = buildChart({ seed: 54321, difficulty });
    assert.notDeepEqual(a.items, c.items);
  }
});

test('ゴミは段階の中だけにあり、目標時刻の順に並び、拍と時刻が対応する', () => {
  for (const difficulty of DIFFS) {
    const chart = buildChart({ seed: 7, difficulty });
    const phases = chart.sections.filter((s) => s.id === 'phase');
    let prev = -Infinity;
    chart.items.forEach((it, i) => {
      assert.equal(it.id, i);
      assert.ok(it.beat > prev);
      prev = it.beat;
      assert.ok(Math.abs(it.time - it.beat * chart.spb) < 1e-9);
      const sec = phases.find((s) => it.beat >= s.startBeat && it.beat < s.endBeat);
      assert.ok(sec, `beat ${it.beat} が段階の外`);
      assert.equal(sec.phase, it.phase);
      assert.ok(CONFIG.phaseTypes[it.phase].includes(it.type), `${it.type} は第 ${it.phase} 段階に出ない`);
      assert.equal(it.dir, CONFIG.types[it.type].dir);
      assert.ok(CONFIG.kinds[it.type].includes(it.kind));
      assert.equal((it.beat * 2) % 1, 0, '8 分音符のマス目に乗っている');
    });
  }
});

test('同じ方向は 4 回以上続かない（捨てないものをはさんでも数える）', () => {
  for (const difficulty of DIFFS) {
    for (const seed of SEEDS) {
      const dirs = buildChart({ seed, difficulty }).items.filter((it) => it.dir).map((it) => it.dir);
      let run = 1;
      for (let i = 1; i < dirs.length; i++) {
        run = dirs[i] === dirs[i - 1] ? run + 1 : 1;
        assert.ok(run <= 3, `seed ${seed} ${difficulty}: 同じ方向が ${run} 回`);
      }
    }
  }
});

test('やさしい・ふつうでは、8 分音符で隣り合う 2 個は同じ種類', () => {
  for (const difficulty of ['easy', 'normal']) {
    for (const seed of SEEDS) {
      const items = buildChart({ seed, difficulty }).items;
      for (let i = 1; i < items.length; i++) {
        if (items[i].beat - items[i - 1].beat === 0.5) {
          assert.equal(items[i].type, items[i - 1].type, `seed ${seed} beat ${items[i].beat}`);
        }
      }
    }
  }
});

test('むずかしいでは、8 分音符で隣り合う 2 個が違う種類になることがある', () => {
  let mixed = 0;
  for (const seed of SEEDS) {
    const items = buildChart({ seed, difficulty: 'hard' }).items;
    for (let i = 1; i < items.length; i++) {
      if (items[i].beat - items[i - 1].beat === 0.5 && items[i].type !== items[i - 1].type) mixed++;
    }
  }
  assert.ok(mixed > 0);
});

test('捨てないものは第 4 段階の 10〜15%、2 個続かず、8 分音符の並びに入らない', () => {
  for (const difficulty of DIFFS) {
    for (const seed of SEEDS) {
      const items = buildChart({ seed, difficulty }).items;
      const p4 = items.filter((it) => it.phase === 4);
      const keeps = p4.filter((it) => it.type === 'keep');
      const ratio = keeps.length / p4.length;
      assert.ok(ratio >= 0.1 - 1e-9 && ratio <= 0.15 + 1e-9, `seed ${seed} ${difficulty}: ${keeps.length}/${p4.length}`);
      assert.ok(items.filter((it) => it.phase !== 4).every((it) => it.type !== 'keep'));
      for (let i = 0; i < items.length; i++) {
        if (items[i].type !== 'keep') continue;
        assert.notEqual(items[i - 1]?.type, 'keep', `seed ${seed}: 捨てないものが続く`);
        const prevGap = items[i].beat - (items[i - 1]?.beat ?? -Infinity);
        const nextGap = (items[i + 1]?.beat ?? Infinity) - items[i].beat;
        assert.ok(prevGap > 0.5 && nextGap > 0.5, `seed ${seed}: 8 分音符の並びに入っている`);
      }
    }
  }
});

test('各段階の最初の 1 小節に、新しく登場した種類が 1 個以上ある', () => {
  for (const difficulty of DIFFS) {
    for (const seed of SEEDS) {
      const chart = buildChart({ seed, difficulty });
      let prev = new Set();
      for (const sec of chart.sections.filter((s) => s.id === 'phase')) {
        const types = CONFIG.phaseTypes[sec.phase];
        const fresh = types.filter((t) => !prev.has(t));
        const firstBar = chart.items.filter((it) => it.beat >= sec.startBeat && it.beat < sec.startBeat + 4);
        assert.ok(firstBar.some((it) => fresh.includes(it.type)), `seed ${seed} 第 ${sec.phase} 段階`);
        prev = new Set(types);
      }
    }
  }
});

test('難しいほど、ゴミの数が多い（平均）', () => {
  const avg = (d) => SEEDS.reduce((s, seed) => s + buildChart({ seed, difficulty: d }).items.length, 0) / SEEDS.length;
  const e = avg('easy');
  const n = avg('normal');
  const h = avg('hard');
  assert.ok(e < n && n < h, `${e} ${n} ${h}`);
});
