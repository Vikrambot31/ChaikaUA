export const CHAIKA_LEVELS = [
  { level: 1,  name: 'Чайчонок',         nameUa: 'Чайченя',            nameEn: 'Chaika Fledgling',  points: 0,    days: 0 },
  { level: 2,  name: 'Чайка-ученик',     nameUa: 'Чайка-учень',        nameEn: 'Chaika Learner',    points: 50,   days: 60 },
  { level: 3,  name: 'Чайка-резидент',   nameUa: 'Чайка-резидент',     nameEn: 'Chaika Resident',   points: 120,  days: 120 },
  { level: 4,  name: 'Чайка-хранитель',  nameUa: 'Чайка-хранитель',    nameEn: 'Chaika Guardian',   points: 220,  days: 180 },
  { level: 5,  name: 'Чайка-инициатор',  nameUa: 'Чайка-ініціатор',    nameEn: 'Chaika Initiator',  points: 360,  days: 240 },
  { level: 6,  name: 'Чайка в дозоре',   nameUa: 'Чайка в дозорі',     nameEn: 'Chaika on Watch',   points: 540,  days: 300 },
  { level: 7,  name: 'Чайка-организатор',nameUa: 'Чайка-організатор',  nameEn: 'Chaika Organizer',  points: 760,  days: 360 },
  { level: 8,  name: 'Чайка-командир',   nameUa: 'Чайка-командир',     nameEn: 'Chaika Commander',  points: 1020, days: 420 },
  { level: 9,  name: 'Серебряная чайка', nameUa: 'Срібна чайка',       nameEn: 'Silver Chaika',     points: 1320, days: 480 },
  { level: 10, name: 'Золотая чайка',    nameUa: 'Золота чайка',       nameEn: 'Golden Chaika',     points: 1700, days: 540 },
];

export type LevelLanguage = 'ua' | 'ru' | 'en';

export const getLevelName = (
  level: (typeof CHAIKA_LEVELS)[number],
  language: LevelLanguage
): string => {
  if (language === 'ua') return level.nameUa;
  if (language === 'en') return level.nameEn;
  return level.name;
};

export type ChaikaActivityInput = {
  registeredAt?: Date | string;
  daysUsed?: number;
  requestCount: number;
  reviewCount: number;
  likeCount?: number;
};

export const getDaysInApp = (registeredAt?: Date | string, daysUsed?: number) => {
  const storedDays = Number.isFinite(daysUsed) ? Number(daysUsed) : 0;
  const registeredTime = registeredAt ? new Date(registeredAt).getTime() : NaN;
  const calculatedDays = Number.isFinite(registeredTime)
    ? Math.max(1, Math.ceil((Date.now() - registeredTime) / 86400000))
    : 0;

  return Math.max(storedDays, calculatedDays);
};

export const getChaikaActivity = ({
  registeredAt,
  daysUsed,
  requestCount,
  reviewCount,
  likeCount = 0,
}: ChaikaActivityInput) => {
  const daysInApp = getDaysInApp(registeredAt, daysUsed);
  const points = requestCount * 15 + reviewCount * 10 + likeCount * 2 + daysInApp * 3;
  const currentLevel =
    [...CHAIKA_LEVELS]
      .reverse()
      .find((item) => points >= item.points && daysInApp >= item.days) ?? CHAIKA_LEVELS[0];
  const nextLevel = CHAIKA_LEVELS.find((item) => item.level === currentLevel.level + 1);
  const currentBase = currentLevel.points;
  const nextBase = nextLevel?.points ?? currentBase;
  const pointProgress = nextLevel
    ? Math.min(100, Math.round(((points - currentBase) / (nextBase - currentBase)) * 100))
    : 100;
  const dayProgress = nextLevel ? Math.min(100, Math.round((daysInApp / nextLevel.days) * 100)) : 100;
  const progress = Math.min(pointProgress, dayProgress);
  const blockedByDays = Boolean(nextLevel && daysInApp < nextLevel.days);
  const daysToNext = nextLevel ? Math.max(0, nextLevel.days - daysInApp) : 0;

  return {
    daysInApp,
    points,
    currentLevel,
    nextLevel,
    progress,
    pointsToNext: nextLevel ? Math.max(0, nextLevel.points - points) : 0,
    daysToNext,
    blockedByDays,
  };
};
