// 3D の配置の数値。scene・items・bins・robot で共有する。
// 座標：x = 右、y = 上、z = 手前。判定位置は z = 0。ベルトは奥（−z）から手前へ流れる。

import { CONFIG } from '../config.js';

export const UNITS_PER_BEAT = 1.8;
export const SPAWN_Z = -CONFIG.approachBeats * UNITS_PER_BEAT;
export const GATE_Z = -CONFIG.scanGateBeats * UNITS_PER_BEAT;
export const BELT_END_Z = 0.9;
export const BELT_WIDTH = 1.6;
export const ITEM_Y = 0.06; // ベルトの上面の高さ（ゴミの底をここに置く）

/** 種類ごとのゴミ箱の位置（投げ入れ口の中心）。 */
export const BIN_POS = {
  burn:    { x: -2.45, y: 1.1,  z: 0.15 },
  plastic: { x: 2.45,  y: 1.1,  z: 0.15 },
  can:     { x: 0,     y: 1.1,  z: 3.1 },
  pet:     { x: 0,     y: 2.35, z: -5.2 }, // じょうごの中心。入り口はこれより 0.3 上
};

export const ROBOT_POS = { x: 0, y: 0, z: 1.45 };
export const UNSORTED_POS = { x: 1.15, y: 0, z: 1.55 };
/** 捨てないものが乗って帰る、かごの位置。 */
export const BASKET_POS = { x: -1.1, y: 0, z: 1.25 };
