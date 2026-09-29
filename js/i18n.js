// 表示する文章のすべて。あとで英語を足せるよう、言語ごとの表にしておく。

const ja = {
  title: 'ぶんべつビート',
  start: 'スタート',
  difficulty: { easy: 'やさしい', normal: 'ふつう', hard: 'むずかしい' },
  types: { burn: '燃えるゴミ', plastic: 'プラスチック', can: '缶・びん', pet: 'ペットボトル', keep: '捨てないもの' },
  dirArrow: { left: '←', right: '→', down: '↓', up: '↑' },
  judge: { perfect: 'PERFECT', good: 'GOOD', miss: 'MISS', safe: 'セーフ！' },
  ready: 'READY',
  combo: 'コンボ',
  pause: 'いちじていし',
  resume: 'つづける',
  retry: 'やりなおす',
  toTitle: 'タイトルへ',
  again: 'もういちど',
  result: 'けっか',
  gameOver: 'エコゲージが なくなった…',
  clear: 'おしまい！',
  keepNotice: 'ひよこと ねこは すてないで！ 見おくろう',
  localRule: '分別のルールは自治体によって異なります',
  muteHint: '音が出ないときは消音モードを解除してください',
  noWebGL: 'この端末では遊べません（WebGL2 が使えません）',
  kinds: {
    banana: 'バナナのかわ', appleCore: 'りんごのしん', fishBone: 'さかなのほね', paperBall: 'かみくず',
    bentoBox: 'おべんとうのようき', shoppingBag: 'レジぶくろ', eggPack: 'たまごのパック', snackBag: 'おかしのふくろ',
    juiceCan: 'ジュースのかん', tinCan: 'かんづめのかん', glassBottle: 'ガラスのびん', jamJar: 'ジャムのびん',
    petSmall: 'ちいさいボトル', petLarge: 'おおきいボトル', petSquare: 'しかくいボトル', petCrushed: 'つぶれたボトル',
    chick: 'ひよこ', cat: 'ねこ',
  },
  fever: 'FEVER!',
  settings: {
    musicVolume: '曲の音量',
    sfxVolume: '効果音の音量',
    timingOffset: 'タイミング調整',
    timingHint: '音より おそく押してしまうなら ＋',
    vibration: 'ふるえる（Android）',
    reduceMotion: '動きを へらす',
  },
  settingsTitle: 'せってい',
  howto: 'あそびかた',
  howto1: 'ゴミが ながれてくる',
  howto2: 'ゴミばこの ほうへ はじく（キーなら ← → ↓ ↑）',
  howto3: 'ラインに きた しゅんかんに！',
  howtoKeep: 'ひよこと ねこは すてないで 見おくってね',
  tapToClose: 'タップで とじる',
  back: 'もどる',
  share: 'シェア',
  shareText: '{title} で 評価 {rank}（{score} 点）！',
  copied: 'コピーしました',
  shareFailed: 'シェアできませんでした',
  bestRecord: 'ハイスコア {score}',
  bestRank: 'さいこう {rank}',
  noRecord: 'まだ きろくが ありません',
  newRecord: 'ハイスコア こうしん！',
  highScore: 'ハイスコア',
  perfectTitle: 'パーフェクト分別！',
  weak: '{type}が にがてみたい。つぎは がんばろう！',
  weakKeep: 'ひよこと ねこは 見おくってね。つぎは がんばろう！',
  allGood: 'ぜんぶ ばっちり！ ありがとう！',
  typeAccuracy: 'しゅるいごとの せいかいりつ',
  keyHint: '← → ↓ ↑ ／ A D S W ／ フリック',
  stats: { perfect: 'PERFECT', good: 'GOOD', miss: 'MISS', maxCombo: 'さいだいコンボ', score: 'とくてん', accuracy: 'せいかくさ' },
};

const tables = { ja };
let current = ja;

export function setLang(lang) {
  current = tables[lang] ?? ja;
}

/**
 * 'judge.perfect' のような鍵で文章を引く。{name} は vars で置きかえる。
 * @param {string} key @param {Record<string, string|number>} [vars]
 */
export function t(key, vars) {
  let v = current;
  for (const k of key.split('.')) v = v?.[k];
  if (typeof v !== 'string') return v ?? key;
  return vars ? v.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : v;
}
