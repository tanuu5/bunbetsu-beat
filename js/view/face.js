// ソータの表情を Canvas に描く。頭の画面と、右下の小窓の両方に同じ絵を使う。

/** @typedef {'normal'|'smile'|'nod'|'panic'|'sparkle'|'dizzy'|'relief'} Expression */

const BG = '#10233A';
const LINE = '#7FE3FF';

/**
 * @param {CanvasRenderingContext2D} g
 * @param {number} size 正方形の一辺（ピクセル）
 * @param {Expression} expr
 * @param {number} t 秒（まばたき、ぐるぐるの回転などに使う）
 */
export function drawFace(g, size, expr, t) {
  const u = size / 100; // 100 × 100 の座標で描く
  g.save();
  g.clearRect(0, 0, size, size);
  g.fillStyle = BG;
  g.fillRect(0, 0, size, size);
  g.scale(u, u);
  g.strokeStyle = LINE;
  g.fillStyle = LINE;
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = LINE;
  g.shadowBlur = 6 * u;

  const blink = expr === 'normal' && t % 3.2 < 0.12;
  const eyes = [[33, 44], [67, 44]];

  const circleEye = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const arc = (x, y, r, up) => {
    g.beginPath();
    if (up) g.arc(x, y + r * 0.5, r, Math.PI * 1.15, Math.PI * 1.85);
    else g.arc(x, y - r * 0.5, r, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  };
  const line = (x0, y0, x1, y1) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  const wave = (x0, x1, y, amp) => {
    g.beginPath();
    for (let i = 0; i <= 12; i++) {
      const x = x0 + ((x1 - x0) * i) / 12;
      const yy = y + Math.sin(i * Math.PI * 0.75) * amp;
      if (i === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  };
  const star = (x, y, r, rot) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  const swirl = (x, y, rot) => {
    g.beginPath();
    for (let i = 0; i <= 30; i++) {
      const a = rot + i * 0.55;
      const r = 1 + i * 0.4;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.lineWidth = 3.5;
    g.stroke();
    g.lineWidth = 5;
  };

  switch (expr) {
    case 'smile':
      for (const [x, y] of eyes) arc(x, y, 10, true);
      g.beginPath();
      g.arc(50, 64, 14, 0.1 * Math.PI, 0.9 * Math.PI);
      g.closePath();
      g.fill();
      break;
    case 'nod':
      for (const [x, y] of eyes) circleEye(x, y, 7);
      g.beginPath();
      g.arc(50, 58, 12, 0.25 * Math.PI, 0.75 * Math.PI);
      g.stroke();
      break;
    case 'panic':
      circleEye(33, 44, 9);
      circleEye(67, 46, 5);
      wave(36, 64, 70, 3);
      // 汗
      g.beginPath();
      g.moveTo(86, 22 + (t * 30) % 10);
      g.quadraticCurveTo(80, 34 + (t * 30) % 10, 86, 36 + (t * 30) % 10);
      g.quadraticCurveTo(92, 34 + (t * 30) % 10, 86, 22 + (t * 30) % 10);
      g.fill();
      break;
    case 'sparkle':
      for (const [x, y] of eyes) star(x, y, 11, t * 2);
      g.beginPath();
      g.arc(50, 60, 17, 0.05 * Math.PI, 0.95 * Math.PI);
      g.closePath();
      g.fill();
      break;
    case 'dizzy':
      for (const [x, y] of eyes) swirl(x, y, -t * 6);
      wave(36, 64, 70, 3);
      break;
    case 'relief':
      for (const [x, y] of eyes) arc(x, y, 9, false);
      g.beginPath();
      g.arc(50, 66, 5, 0, Math.PI * 2);
      g.stroke();
      break;
    default:
      if (blink) for (const [x, y] of eyes) line(x - 7, y, x + 7, y);
      else for (const [x, y] of eyes) circleEye(x, y, 7);
      line(42, 64, 58, 64);
  }
  g.restore();
}

/**
 * いまの表情を決める。変わった表情は 0.6 秒で戻る。フィーバーとぐるぐるは、状態が続くあいだ保つ。
 */
export function createFaceState() {
  /** @type {Expression} */
  let transient = 'normal';
  let until = -Infinity;
  return {
    /** @param {Expression} e @param {number} now 秒 */
    set(e, now) {
      transient = e;
      until = now + 0.6;
    },
    reset() {
      until = -Infinity;
    },
    /**
     * @param {number} now
     * @param {{ fever: boolean, low: boolean }} state
     * @returns {Expression}
     */
    get(now, state) {
      if (now < until && now >= until - 0.6) return transient;
      if (state.fever) return 'sparkle';
      if (state.low) return 'dizzy';
      return 'normal';
    },
  };
}
