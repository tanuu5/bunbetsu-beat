import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScore, comboMultiplier, rankFor } from '../js/core/score.js';

const spb = 0.5; // BPM 120
let nextId = 0;
const ev = (kind, time, type = 'burn') => ({ kind, item: { id: nextId++, time, type }, time });

test('倍率はコンボ 10 ごとに 0.1、上限 2.0', () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(9), 1);
  assert.ok(Math.abs(comboMultiplier(10) - 1.1) < 1e-9);
  assert.ok(Math.abs(comboMultiplier(25) - 1.2) < 1e-9);
  assert.equal(comboMultiplier(100), 2);
  assert.equal(comboMultiplier(500), 2);
});

test('評価の境目', () => {
  assert.equal(rankFor(0.95), 'S');
  assert.equal(rankFor(0.9499), 'A');
  assert.equal(rankFor(0.85), 'A');
  assert.equal(rankFor(0.7), 'B');
  assert.equal(rankFor(0.69), 'C');
});

test('得点・コンボ・からぶり・MISS', () => {
  const s = createScore({ difficulty: 'normal', spb, totalItems: 100 });
  assert.equal(s.apply(ev('perfect', 1)).points, 100);
  assert.equal(s.apply(ev('good', 2)).points, 60);
  s.apply({ kind: 'empty', time: 2.5 });
  assert.equal(s.state.combo, 2, 'からぶりはコンボを切らない');
  assert.equal(s.state.counts.empty, 1);
  assert.equal(s.apply(ev('safe', 3, 'keep')).points, 100);
  assert.equal(s.state.combo, 3);
  s.apply(ev('miss', 4));
  assert.equal(s.state.combo, 0);
  assert.equal(s.state.maxCombo, 3);
  assert.equal(s.state.score, 260);
});

test('コンボ 10 に達した入力から 1.1 倍', () => {
  const s = createScore({ difficulty: 'normal', spb, totalItems: 100 });
  for (let i = 0; i < 9; i++) s.apply(ev('perfect', i));
  const r = s.apply(ev('perfect', 9));
  assert.equal(r.points, 110);
  assert.ok(r.comboMilestone);
});

test('エコゲージ：開始 70、上限 100、MISS で −10、0 で終了', () => {
  const s = createScore({ difficulty: 'normal', spb, totalItems: 100 });
  assert.equal(s.state.gauge, 70);
  s.apply(ev('perfect', 0));
  assert.equal(s.state.gauge, 72);
  s.apply(ev('good', 1));
  assert.equal(s.state.gauge, 73);
  for (let i = 0; i < 20; i++) s.apply(ev('perfect', 2 + i));
  assert.equal(s.state.gauge, 100);
  let r;
  for (let i = 0; i < 10; i++) r = s.apply(ev('miss', 30 + i));
  assert.equal(s.state.gauge, 0);
  assert.ok(r.gameOver);
  assert.equal(s.result().cleared, false);
});

test('やさしいは MISS で −6、0 でも終了しない', () => {
  const s = createScore({ difficulty: 'easy', spb: 0.6, totalItems: 100 });
  s.apply(ev('miss', 0));
  assert.equal(s.state.gauge, 64);
  for (let i = 0; i < 20; i++) s.apply(ev('miss', 1 + i));
  assert.equal(s.state.gauge, 0);
  assert.equal(s.state.gameOver, false);
});

test('フィーバー：コンボ 30 で 8 小節、得点 2 倍、MISS で切れない、再び 30 積めば入る', () => {
  const s = createScore({ difficulty: 'normal', spb, totalItems: 200 });
  let t = 0;
  for (let i = 0; i < 29; i++) assert.equal(s.apply(ev('perfect', (t += 0.5))).fever, false);
  const r30 = s.apply(ev('perfect', (t += 0.5)));
  assert.ok(r30.feverStarted);
  assert.ok(r30.fever);
  assert.equal(r30.points, Math.round(100 * 1.3 * 2));
  const feverEnd = t + 8 * 4 * spb; // 16 秒後
  s.apply(ev('miss', (t += 0.5)));
  const r = s.apply(ev('perfect', (t += 0.5)));
  assert.ok(r.fever, 'MISS してもフィーバーは続く');
  assert.equal(r.points, 200);
  // フィーバーの終わりまで進める（その間のコンボはフィーバーの外の分に数えない）
  while (t + 0.5 < feverEnd) s.apply(ev('perfect', (t += 0.5)));
  const after = s.apply(ev('perfect', (t = feverEnd)));
  assert.equal(after.fever, false);
  assert.equal(after.feverStarted, false);
  for (let i = 0; i < 28; i++) s.apply(ev('perfect', (t += 0.5)));
  assert.ok(s.apply(ev('perfect', (t += 0.5))).feverStarted, 'フィーバーのあと 30 積んで再び入る');
  assert.equal(s.state.feverCount, 2);
});

test('正確さ・評価・パーフェクト分別・種類ごとの正解率', () => {
  const s = createScore({ difficulty: 'normal', spb, totalItems: 10 });
  for (let i = 0; i < 8; i++) s.apply(ev('perfect', i, 'burn'));
  s.apply(ev('safe', 8, 'keep'));
  s.apply(ev('good', 9, 'plastic'));
  let r = s.result();
  assert.ok(Math.abs(r.accuracy - 0.96) < 1e-9);
  assert.equal(r.rank, 'S');
  assert.equal(r.perfectTitle, false);
  assert.equal(r.weakestType, null, 'GOOD も正解に数える');

  const p = createScore({ difficulty: 'normal', spb, totalItems: 3 });
  p.apply(ev('perfect', 0));
  p.apply(ev('safe', 1, 'keep'));
  p.apply(ev('perfect', 2));
  assert.equal(p.result().perfectTitle, true);

  const m = createScore({ difficulty: 'normal', spb, totalItems: 4 });
  m.apply(ev('perfect', 0, 'burn'));
  m.apply(ev('miss', 1, 'plastic'));
  m.apply(ev('perfect', 2, 'plastic'));
  m.apply(ev('miss', 3, 'can'));
  r = m.result();
  assert.equal(r.typeAccuracy.plastic, 0.5);
  assert.equal(r.weakestType, 'can');
  assert.equal(r.rank, 'C');
});
