// キーボードとポインター（指・マウス・ペン）の入力。
// 判定は描画のコマを待たず、入力イベントの中で行う（受け取った側が同期的に判定する）。

import { createFlickTracker } from './core/flick.js';

const KEY_DIR = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'down', KeyS: 'down',
  ArrowUp: 'up', KeyW: 'up',
};
const NO_SCROLL = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space']);

/** イベントの時刻（performance.now() と同じ基準）。おかしな値なら今の時刻を使う。 */
export function eventTime(e) {
  const now = performance.now();
  const t = e.timeStamp;
  return t > 0 && t <= now + 5 && now - t < 1000 ? t : now;
}

/**
 * @param {{
 *   surface: HTMLElement,
 *   onDir: (dir: string, timeMs: number, source: 'key'|'flick') => void,
 *   onTap: (x: number, y: number, timeMs: number) => void,
 *   onConfirm?: () => void,
 *   onPause?: () => void,
 *   onNav?: (dir: string) => void,
 * }} h
 */
export function createInput(h) {
  const flick = createFlickTracker();
  let enabled = false;

  window.addEventListener('keydown', (e) => {
    // 音量のつまみなどは、矢印キーをそのまま使う
    if (e.target instanceof HTMLInputElement && e.code !== 'Escape') return;
    if (NO_SCROLL.has(e.code) && !(e.target instanceof HTMLButtonElement && e.code === 'Space')) e.preventDefault();
    if (e.repeat) return;
    const dir = KEY_DIR[e.code];
    if (dir) {
      if (enabled) h.onDir(dir, eventTime(e), 'key');
      else h.onNav?.(dir); // プレイ中でないときは、画面の操作に使う
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      h.onPause?.();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      // ボタンにフォーカスがあるときは、ボタンの既定の動きにまかせる
      if (e.target instanceof HTMLButtonElement) return;
      // 自分で処理したときは既定の動きを止める。止めないと、画面が切り替わって
      // フォーカスが移った先のボタンまで同じキーで押されてしまう
      e.preventDefault();
      h.onConfirm?.();
    }
  });

  const s = h.surface;
  s.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 一時停止ボタンなど、ボタンの上から始めた操作はフリックにしない
    if (!enabled || (e.target instanceof Element && e.target.closest('button'))) return;
    e.preventDefault();
    try {
      s.setPointerCapture(e.pointerId);
    } catch {
      /* 取れなくても動く */
    }
    flick.down(e.pointerId, e.clientX, e.clientY, eventTime(e));
  });
  s.addEventListener('pointermove', (e) => {
    if (!enabled) return;
    // まとめられた細かい動きも見て、24 ピクセルを超えた瞬間の時刻を使う
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of list.length ? list : [e]) {
      if (emit(flick.move(e.pointerId, ce.clientX, ce.clientY, eventTime(ce)))) break;
    }
  });
  const end = (e) => {
    if (!enabled) return;
    emit(flick.up(e.pointerId, e.clientX, e.clientY, eventTime(e)));
  };
  s.addEventListener('pointerup', end);
  s.addEventListener('pointercancel', (e) => flick.cancel(e.pointerId));
  s.addEventListener('contextmenu', (e) => e.preventDefault());

  /** @param {import('./core/flick.js').GestureEvent|null} g */
  function emit(g) {
    if (!g) return false;
    if (g.type === 'flick') h.onDir(g.dir, g.time, 'flick');
    else h.onTap(g.x, g.y, g.time);
    return true;
  }

  return {
    setEnabled(v) {
      enabled = v;
    },
    /** 毎コマ呼ぶ。置いたまま動かない指をタップとして確定する。 */
    update(nowMs) {
      for (const g of flick.update(nowMs)) emit(g);
    },
    /** まだ決まっていない指のうち、最も早く置いた時刻（ミリ秒）。 */
    earliestPending: () => flick.earliestPending(),
  };
}
