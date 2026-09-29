// 流れてくるゴミ。位置は毎コマ「目標時刻 − 曲の時刻」から直接求める。
// 形・素材・メッシュはすべて最初に作り、プレイ中は使い回す。

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SPAWN_Z, BELT_END_Z, ITEM_Y, BIN_POS, UNSORTED_POS, BASKET_POS } from './layout.js';
import { buildModels } from './models.js';
import { part, merge, shadowTexture } from './geo.js';

const POOL_SIZE = 40;
const THROW_SEC = 0.25;
const REJECT_SEC = 0.45;
const FALL_SEC = 0.35;
const HOP_SEC = 0.3;
const RIDE_SEC = 1.1;
const OUTLINE_SCALE = 1.14;

/**
 * @typedef {object} Vis
 * @property {'belt'|'thrown'|'rejected'|'done'} state
 *   belt = ベルトの上（見逃し・捨てないものは、そのあとの動きもここで決める）、
 *   thrown = ゴミ箱へ飛んでいる、rejected = まちがいで未分別の箱へ
 * @property {number} at    状態が変わった曲の時刻
 * @property {THREE.Vector3} from
 * @property {string|null} target 投げた先の種類
 * @property {number} slot  使っているメッシュの番号。-1 = なし
 * @property {boolean} landed
 */

function basketGeometry() {
  const wood = '#C98B4B';
  const dark = '#9A6431';
  return merge([
    part(new THREE.CylinderGeometry(0.34, 0.27, 0.22, 16, 1, true), (p) => (Math.sin(Math.atan2(p.z, p.x) * 8) > 0 ? wood : dark), { pos: [0, 0.11, 0] }),
    part(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 16), dark, { pos: [0, 0.01, 0] }),
    part(new THREE.TorusGeometry(0.34, 0.03, 6, 20), wood, { pos: [0, 0.22, 0], rot: [Math.PI / 2, 0, 0] }),
    part(new THREE.TorusGeometry(0.3, 0.025, 6, 16, Math.PI), dark, { pos: [0, 0.22, 0] }),
  ]);
}

/**
 * @param {THREE.Scene} scene
 * @param {{
 *   onLand?: (type: string, pos: THREE.Vector3, now: number) => void,
 *   onUnsorted?: (pos: THREE.Vector3, now: number) => void,
 * }} [hooks]
 */
export function createItems(scene, hooks = {}) {
  const models = buildModels();
  const itemMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // 手助け：スキャンの門を通ると、輪郭が種類の色で光る（裏返した一回り大きい形で描く）
  const outlineMat = Object.fromEntries(
    ['burn', 'plastic', 'can', 'pet'].map((type) => [
      type,
      new THREE.MeshBasicMaterial({ color: CONFIG.types[type].color, side: THREE.BackSide }),
    ]),
  );
  const basketGeo = basketGeometry();
  const firstKind = Object.keys(models)[0];

  // 影は 1 回の描画でまとめて描く
  const shadows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    POOL_SIZE,
  );
  shadows.renderOrder = 1;
  shadows.frustumCulled = false;
  scene.add(shadows);
  const shadowM = new THREE.Matrix4();
  const shadowQ = new THREE.Quaternion();
  const shadowP = new THREE.Vector3();
  const shadowS = new THREE.Vector3();
  const setShadow = (i, x, y, z, r) => {
    shadowS.set(r * 2, 1, r * 2);
    shadowM.compose(shadowP.set(x, y, z), shadowQ, shadowS);
    shadows.setMatrixAt(i, shadowM);
  };

  // かごの置き場所（いつも 1 つ待っている）
  const homeBasket = new THREE.Mesh(basketGeo, itemMat);
  homeBasket.position.set(BASKET_POS.x, 0, BASKET_POS.z);
  scene.add(homeBasket);

  /** @type {{ group: THREE.Group, mesh: THREE.Mesh, outline: THREE.Mesh, basket: THREE.Mesh, half: number, radius: number }[]} */
  const pool = [];
  const free = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(models[firstKind].geometry, itemMat);
    const outline = new THREE.Mesh(models[firstKind].geometry, outlineMat.burn);
    outline.scale.setScalar(OUTLINE_SCALE);
    outline.visible = false;
    const basket = new THREE.Mesh(basketGeo, itemMat);
    basket.visible = false;
    group.add(mesh, outline);
    group.visible = false;
    scene.add(group, basket);
    pool.push({ group, mesh, outline, basket, half: 0, radius: 0 });
    free.push(i);
    setShadow(i, 0, -10, 0, 0);
  }

  /** @type {import('../core/chart.js').ChartItem[]} */
  let items = [];
  /** @type {Vis[]} */
  let vis = [];
  let first = 0;
  let approach = 1;
  let speed = 1; // ベルトの速さ（1 秒あたりの長さ）
  let gateSec = 0;
  /** @type {(item: import('../core/chart.js').ChartItem) => boolean} */
  let assist = () => false;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  function acquire(item) {
    const slot = free.pop();
    if (slot === undefined) return -1;
    const s = pool[slot];
    const m = models[item.kind];
    s.mesh.geometry = m.geometry;
    s.outline.geometry = m.geometry;
    if (item.type !== 'keep') s.outline.material = outlineMat[item.type];
    s.outline.visible = false;
    s.half = m.halfHeight;
    s.radius = m.radius;
    s.group.visible = true;
    s.group.rotation.set(0, 0, 0);
    s.group.scale.setScalar(1);
    s.basket.visible = false;
    return slot;
  }

  function release(v) {
    if (v.slot >= 0) {
      const s = pool[v.slot];
      s.group.visible = false;
      s.basket.visible = false;
      setShadow(v.slot, 0, -10, 0, 0);
      free.push(v.slot);
    }
    v.slot = -1;
    v.state = 'done';
  }

  /** ベルトの上の位置（ゴミの中心）。判定位置を過ぎても流れ続ける。 */
  function beltPos(item, now, half, out) {
    return out.set(0, ITEM_Y + half, (now - item.time) * speed);
  }

  return {
    /**
     * 譜面を差しかえる。
     * @param {{ gateSec: number, assist: (item: any) => boolean }} opts
     */
    reset(newItems, approachSec, opts) {
      for (const v of vis) release(v);
      items = newItems;
      approach = approachSec;
      speed = -SPAWN_Z / approachSec;
      gateSec = opts.gateSec;
      assist = opts.assist;
      first = 0;
      vis = items.map(() => ({ state: 'belt', at: 0, from: new THREE.Vector3(), target: null, slot: -1, landed: false }));
    },

    /** 判定の結果を見た目に反映する。 */
    onJudge(ev, now) {
      if (!ev.item) return;
      const v = vis[ev.item.id];
      if (!v || v.state !== 'belt') return;
      const half = v.slot >= 0 ? pool[v.slot].half : 0.25;
      beltPos(ev.item, now, half, v.from);
      v.at = now;
      if (ev.kind === 'perfect' || ev.kind === 'good') {
        v.state = 'thrown';
        v.target = ev.item.type;
      } else if (ev.kind === 'miss' && ev.reason === 'wrong') {
        v.state = 'rejected';
      }
      // 見逃しと、捨てないもの（セーフでも MISS でも）は、そのままベルトの端まで流れる
    },

    /**
     * スキャンの門を通って、まだベルトの上にあるゴミ（名前の表示用）。
     * @param {(item: import('../core/chart.js').ChartItem, pos: THREE.Vector3) => void} cb
     */
    eachScanned(now, cb) {
      for (let i = first; i < items.length; i++) {
        const item = items[i];
        const ahead = item.time - now;
        if (ahead > gateSec) break;
        const v = vis[i];
        if (v.state === 'belt' && v.slot >= 0 && ahead > -0.15) cb(item, pool[v.slot].group.position);
      }
    },

    /**
     * スキャンの門を通っているゴミの進み具合（0 = 門に入る、1 = 出る）。なければ −1。
     * @param {number} now
     */
    scanPhase(now) {
      const w = 0.3 / speed; // 門の前後 0.3 の長さぶん
      for (let i = first; i < items.length; i++) {
        const ahead = items[i].time - now;
        if (ahead > gateSec + w) break;
        if (ahead < gateSec - w) continue;
        if (vis[i].state !== 'belt') continue;
        return (gateSec + w - ahead) / (2 * w);
      }
      return -1;
    },

    /** ベルトが進んだ長さ（流れを示す線を動かすため）。 */
    beltOffset(now) {
      return now * speed;
    },

    /** @param {number} now 曲の時刻 */
    update(now) {
      const endT = BELT_END_Z / speed; // 目標時刻からベルトの端までの秒数
      for (let i = first; i < items.length; i++) {
        const item = items[i];
        const v = vis[i];
        if (item.time - now > approach) break; // まだ出てこない
        if (v.state === 'done') {
          if (i === first) first++;
          continue;
        }
        if (v.slot < 0) {
          v.slot = acquire(item);
          if (v.slot < 0) continue;
        }
        const s = pool[v.slot];
        const g = s.group;
        const k = now - v.at;
        let shadowY = ITEM_Y + 0.005;
        let shadowR = s.radius * 1.1;

        if (v.state === 'belt') {
          const d = now - item.time; // 目標時刻を過ぎてからの秒数
          beltPos(item, now, s.half, g.position);
          g.rotation.set(0, 0, Math.sin(now * 9 + i) * 0.05); // ベルトの上で小さく揺れる
          g.position.y += Math.abs(Math.sin(now * 9 + i)) * 0.02;
          s.outline.visible = item.type !== 'keep' && -d <= gateSec && assist(item);
          if (d > endT) {
            const u = d - endT;
            s.outline.visible = false;
            if (item.type === 'keep') {
              // かごに飛び乗って、画面の外へ帰っていく
              const hop = Math.min(1, u / HOP_SEC);
              tmp.set(0, ITEM_Y + s.half, BELT_END_Z);
              tmp2.set(BASKET_POS.x, 0.12 + s.half, BASKET_POS.z);
              g.position.lerpVectors(tmp, tmp2, hop);
              g.position.y += Math.sin(hop * Math.PI) * 0.5;
              shadowY = 0.01;
              if (hop >= 1) {
                const r = Math.min(1, (u - HOP_SEC) / RIDE_SEC);
                const x = BASKET_POS.x - r * r * 5.5;
                g.position.x = x;
                g.position.y += Math.abs(Math.sin(r * 18)) * 0.05;
                g.rotation.z = Math.sin(r * 18) * 0.1;
                s.basket.visible = true;
                s.basket.position.set(x, Math.abs(Math.sin(r * 18)) * 0.05, BASKET_POS.z);
                if (r >= 1) {
                  release(v);
                  continue;
                }
              }
            } else {
              // ベルトの端から、未分別の箱へ落ちる
              const f = Math.min(1, u / FALL_SEC);
              tmp.set(0, ITEM_Y + s.half, BELT_END_Z);
              tmp2.set(UNSORTED_POS.x, 0.3, UNSORTED_POS.z);
              g.position.lerpVectors(tmp, tmp2, f);
              g.position.y += Math.sin(f * Math.PI) * 0.35;
              g.rotation.z = f * 2;
              shadowY = 0.01;
              if (f >= 1) {
                hooks.onUnsorted?.(g.position, now);
                release(v);
                continue;
              }
            }
          }
        } else if (v.state === 'thrown') {
          // 放物線を描いてゴミ箱へ。上へは、バスケットボールのシュートのように高く
          const p = Math.min(1, k / THROW_SEC);
          const b = BIN_POS[v.target];
          tmp.set(b.x, v.target === 'pet' ? b.y + 0.35 : b.y, b.z);
          g.position.lerpVectors(v.from, tmp, p);
          g.position.y += Math.sin(p * Math.PI) * (v.target === 'pet' ? 1.6 : 1.1);
          g.rotation.set(p * 9, p * 5, 0);
          g.scale.setScalar(1 - p * 0.35);
          s.outline.visible = false;
          shadowY = 0.01;
          shadowR *= 1 - p * 0.6;
          if (p >= 1) {
            hooks.onLand?.(v.target, g.position, now);
            release(v);
            continue;
          }
        } else if (v.state === 'rejected') {
          // まちがい：はじかれて、未分別の箱へ
          const p = Math.min(1, k / REJECT_SEC);
          tmp.set(UNSORTED_POS.x, 0.3, UNSORTED_POS.z);
          g.position.lerpVectors(v.from, tmp, p);
          g.position.y += Math.sin(p * Math.PI) * 0.8;
          g.rotation.z = p * 5;
          s.outline.visible = false;
          shadowY = 0.01;
          if (p >= 1) {
            hooks.onUnsorted?.(g.position, now);
            release(v);
            continue;
          }
        }
        // 高く上がるほど、影を小さく
        const h = Math.max(0, g.position.y - s.half - shadowY);
        setShadow(v.slot, g.position.x, shadowY, g.position.z, shadowR / (1 + h * 1.5));
      }
      shadows.instanceMatrix.needsUpdate = true;
    },
  };
}
