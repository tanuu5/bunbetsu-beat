import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlickTracker, dirFromDelta } from '../js/core/flick.js';

test('方向は横と縦の大きいほう', () => {
  assert.equal(dirFromDelta(-30, 10), 'left');
  assert.equal(dirFromDelta(30, -10), 'right');
  assert.equal(dirFromDelta(5, 30), 'down');
  assert.equal(dirFromDelta(-5, -30), 'up');
});

test('24 ピクセル動いた瞬間に確定し、時刻は確定した時刻', () => {
  const f = createFlickTracker();
  f.down(1, 100, 100, 1000);
  assert.equal(f.move(1, 110, 100, 1010), null);
  assert.equal(f.move(1, 123, 100, 1020), null);
  assert.deepEqual(f.move(1, 124, 100, 1030), { type: 'flick', id: 1, dir: 'right', time: 1030 });
  // 確定したあとは、離すまで何も出ない
  assert.equal(f.move(1, 60, 100, 1040), null);
  assert.equal(f.up(1, 60, 100, 1050), null);
});

test('斜めは距離で測る', () => {
  const f = createFlickTracker();
  f.down(1, 0, 0, 0);
  assert.equal(f.move(1, 16, 16, 10), null); // 約 22.6
  assert.equal(f.move(1, 18, 18, 20).type, 'flick'); // 約 25.5
});

test('動かさずに離したらタップ。時刻と位置は指を置いたとき', () => {
  const f = createFlickTracker();
  f.down(3, 50, 60, 500);
  f.move(3, 55, 62, 550);
  assert.deepEqual(f.up(3, 55, 62, 600), { type: 'tap', id: 3, x: 50, y: 60, time: 500 });
});

test('300 ミリ秒動かなければタップに確定し、そのあと動いてもフリックにならない', () => {
  const f = createFlickTracker();
  f.down(1, 0, 0, 0);
  assert.deepEqual(f.update(300), []);
  assert.equal(f.earliestPending(), 0);
  const taps = f.update(301);
  assert.equal(taps.length, 1);
  assert.equal(taps[0].type, 'tap');
  assert.equal(f.earliestPending(), null);
  assert.equal(f.move(1, 100, 0, 320), null);
  assert.equal(f.up(1, 100, 0, 330), null);
});

test('300 ミリ秒を過ぎてから動いた場合も、フリックではなくタップ', () => {
  const f = createFlickTracker();
  f.down(1, 0, 0, 0);
  assert.equal(f.move(1, 50, 0, 350).type, 'tap');
});

test('2 本の指は別々の入力', () => {
  const f = createFlickTracker();
  f.down(1, 0, 0, 0);
  f.down(2, 200, 0, 5);
  assert.equal(f.earliestPending(), 0);
  assert.equal(f.move(1, -30, 0, 20).dir, 'left');
  assert.equal(f.earliestPending(), 5);
  assert.equal(f.move(2, 200, 30, 25).dir, 'down');
  assert.equal(f.earliestPending(), null);
});

test('取り消された指は何も出さない', () => {
  const f = createFlickTracker();
  f.down(1, 0, 0, 0);
  f.cancel(1);
  assert.deepEqual(f.update(1000), []);
  assert.equal(f.up(1, 0, 0, 1000), null);
});
