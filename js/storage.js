// 保存と読み出し。localStorage が使えない環境でも止まらないようにする。

const KEY = 'bunbetsu-beat:v1';

export function defaultData() {
  return {
    highScore: { easy: 0, normal: 0, hard: 0 },
    bestRank: { easy: null, normal: null, hard: null },
    settings: {
      musicVolume: 0.8,
      sfxVolume: 1.0,
      timingOffsetMs: 0,
      vibration: true,
      reduceMotion: false,
    },
    tutorialSeen: false,
  };
}

/** 保存された値を、既定の形に重ねて返す。壊れていたら既定値。 */
export function load() {
  const d = defaultData();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    return {
      highScore: { ...d.highScore, ...s.highScore },
      bestRank: { ...d.bestRank, ...s.bestRank },
      settings: { ...d.settings, ...s.settings },
      tutorialSeen: !!s.tutorialSeen,
    };
  } catch {
    return d;
  }
}

export function save(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
