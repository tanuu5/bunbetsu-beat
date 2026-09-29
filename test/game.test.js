// 譜面・判定・得点をつないで、1 回ぶんのプレイを画面なしで流す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChart } from '../js/core/chart.js';
import { createJudge } from '../js/core/judge.js';
import { createScore } from '../js/core/score.js';
import { judgeWindowsFor } from '../js/config.js';

const DIFFS = ['easy', 'normal', 'hard'];

function play(difficulty, seed, inputFor) {
  const chart = buildChart({ seed, difficulty });
  const judge = createJudge(chart.items, judgeWindowsFor(difficulty));
  const score = createScore({ difficulty, spb: chart.spb, totalItems: chart.items.length });
  const apply = (evs) => {
    for (const ev of evs) if (score.apply(ev).gameOver) return true;
    return false;
  };
  let over = false;
  for (const it of chart.items) {
    const inp = inputFor(it);
    if (inp && (over = apply(judge.input(inp.dir, inp.time)))) break;
  }
  if (!over) apply(judge.update(chart.duration));
  return { chart, score, judge };
}

test('自動で完璧に入力すると、すべて PERFECT かセーフで評価 S・パーフェクト分別', () => {
  for (const d of DIFFS) {
    for (let seed = 1; seed <= 30; seed++) {
      const { chart, score } = play(d, seed, (it) => (it.dir ? { dir: it.dir, time: it.time } : null));
      const r = score.result();
      assert.equal(r.counts.perfect + r.counts.safe, chart.items.length, `${d} seed ${seed}`);
      assert.equal(r.counts.miss, 0);
      assert.equal(r.rank, 'S');
      assert.ok(r.perfectTitle);
      assert.equal(r.maxCombo, chart.items.length);
      assert.ok(score.state.feverCount >= 1, 'フィーバーに入る');
      assert.equal(r.cleared, true);
    }
  }
});

test('ずっと GOOD の幅で入力すると評価は B〜C（正確さ 60% ほど）', () => {
  const { score } = play('normal', 3, (it) => (it.dir ? { dir: it.dir, time: it.time + 0.1 } : null));
  const r = score.result();
  assert.ok(r.counts.good > 0 && r.counts.perfect === 0);
  assert.ok(r.accuracy > 0.6 && r.accuracy < 0.7, String(r.accuracy));
});

test('何も入力しないと、ふつう・むずかしいはゲージ 0 で途中終了、やさしいは最後まで続く', () => {
  for (const d of ['normal', 'hard']) {
    const { score, judge } = play(d, 5, () => null);
    assert.equal(score.state.gameOver, true);
    assert.equal(score.state.gauge, 0);
    assert.equal(judge.done, true); // update(duration) で最後まで判定だけは進む
    assert.equal(score.result().cleared, false);
  }
  const { score } = play('easy', 5, () => null);
  assert.equal(score.state.gameOver, false);
  assert.equal(score.state.gauge, 0);
  assert.equal(score.result().rank, 'C');
});

test('捨てないものに触れると MISS、見送るとセーフ', () => {
  const touch = play('normal', 9, (it) => ({ dir: it.dir ?? 'left', time: it.time }));
  const keeps = touch.chart.items.filter((it) => it.type === 'keep').length;
  assert.ok(keeps > 0);
  assert.equal(touch.score.state.counts.miss, keeps);
  assert.equal(touch.score.state.counts.safe, 0);
});
