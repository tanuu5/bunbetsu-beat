import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJudge, judgeHit } from '../js/core/judge.js';

const W = { perfect: 0.06, good: 0.13 };
const HARD = { perfect: 0.045, good: 0.1 };

function item(id, time, dir = 'left', type = 'burn') {
  return { id, beat: time * 2, time, type, dir, kind: 'x', phase: 1 };
}
const keep = (id, time) => item(id, time, null, 'keep');
const last = (arr) => arr[arr.length - 1];

test('判定幅の境目', () => {
  const it = item(0, 1);
  assert.equal(judgeHit(it, 'left', 1.0, W).kind, 'perfect');
  assert.equal(judgeHit(it, 'left', 1.06, W).kind, 'perfect');
  assert.equal(judgeHit(it, 'left', 0.94, W).kind, 'perfect');
  assert.equal(judgeHit(it, 'left', 1.061, W).kind, 'good');
  assert.equal(judgeHit(it, 'left', 0.87, W).kind, 'good');
  assert.equal(judgeHit(it, 'left', 1.046, HARD).kind, 'good');
  const wrong = judgeHit(it, 'right', 1.0, W);
  assert.equal(wrong.kind, 'miss');
  assert.equal(wrong.reason, 'wrong');
  assert.ok(Math.abs(judgeHit(it, 'left', 1.02, W).delta - 0.02) < 1e-9);
});

test('判定幅の外の入力はからぶり。ゴミはそのまま残る', () => {
  const j = createJudge([item(0, 1)], W);
  assert.equal(last(j.input('left', 0.86)).kind, 'empty');
  assert.equal(last(j.input('left', 0.99)).kind, 'perfect');
});

test('むずかしいの判定幅は狭い', () => {
  const j = createJudge([item(0, 1)], HARD);
  assert.equal(last(j.input('left', 0.89)).kind, 'empty');
  assert.equal(last(j.input('left', 0.905)).kind, 'good');
});

test('1 回の入力で判定するのは 1 個だけ。近いほうを選ぶ', () => {
  // 8 分音符（BPM 140 で約 0.214 秒）の並び
  const items = [item(0, 1.0), item(1, 1.2), item(2, 1.4)];
  const j = createJudge(items, W);
  const ev = j.input('left', 1.12);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].item.id, 1);
  assert.equal(ev[0].kind, 'good');
  // 残りの 0 番は、そのあとの入力で見逃しとして先に確定する
  const ev2 = j.input('left', 1.4);
  assert.deepEqual(ev2.map((e) => [e.kind, e.item.id]), [['miss', 0], ['perfect', 2]]);
  assert.equal(ev2[0].reason, 'late');
});

test('判定済みのゴミはもう一度判定しない', () => {
  const j = createJudge([item(0, 1.0)], W);
  assert.equal(last(j.input('left', 1.0)).kind, 'perfect');
  assert.equal(last(j.input('left', 1.01)).kind, 'empty');
});

test('見逃しは目標時刻 + good を過ぎたとき', () => {
  const j = createJudge([item(0, 1.0)], W);
  assert.deepEqual(j.update(1.13), []);
  const ev = j.update(1.131);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, 'miss');
  assert.equal(ev[0].reason, 'late');
  assert.deepEqual(j.update(2), []);
  assert.ok(j.done);
});

test('捨てないもの：見送ればセーフ、入力したら MISS', () => {
  const j = createJudge([keep(0, 1.0), keep(1, 2.0)], W);
  assert.equal(j.update(1.2)[0].kind, 'safe');
  const ev = last(j.input('up', 2.05));
  assert.equal(ev.kind, 'miss');
  assert.equal(ev.reason, 'touched');
});

test('違う方向は MISS（まちがい）', () => {
  const j = createJudge([item(0, 1.0, 'down', 'can')], W);
  const ev = last(j.input('left', 1.0));
  assert.equal(ev.kind, 'miss');
  assert.equal(ev.reason, 'wrong');
});
