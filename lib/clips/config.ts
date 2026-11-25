/**
 * Конфигурация автонарезок стримеров (см. PLAN_CLIPS.md).
 * Добавляйте только стримеров, которые разрешают нарезки своего контента.
 */

export interface FacecamRect {
  /** Координаты вебки в исходном видео 1920x1080 (пиксели). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StreamerConfig {
  /** Twitch login (из URL twitch.tv/<login>). */
  login: string;
  /** Положение вебки. Если задано: вебка сверху, игра снизу. Иначе размытый фон. */
  facecam?: FacecamRect;
  /** Минимум просмотров клипа на Twitch, чтобы брать его в работу. */
  minClipViews?: number;
  enabled: boolean;
}

/**
 * Отбор 2026-11-19 по клипам Twitch за 7 дней (число клипов с 1000+ просмотров, 10-й по силе клип).
 * У мужчин поток клипов в 3-5 раз сильнее, поэтому порог просмотров выше.
 */
export const STREAMERS: StreamerConfig[] = [
  // Мужчины
  { login: "buster", enabled: true, minClipViews: 1500 },
  { login: "leva2k", enabled: true, minClipViews: 1500 },
  { login: "zloyn", enabled: true, minClipViews: 1000 },
  { login: "ravshann", enabled: true, minClipViews: 1000 },
  { login: "sasavot", enabled: true, minClipViews: 1000 },
  // Женщины
  { login: "gensyxa", enabled: true, minClipViews: 400 },
  { login: "yuuechka", enabled: true, minClipViews: 400 },
  { login: "whylollycry", enabled: true, minClipViews: 400 },
  { login: "nenormova", enabled: true, minClipViews: 300 },
  { login: "korya_mc", enabled: true, minClipViews: 300 },
  // Запас: включать, если основные молчат.
  { login: "skywhywalker", enabled: false },
  { login: "strogo", enabled: false }, // много 18+ клипов, модерация режет большую часть
  { login: "ekatze007", enabled: false },
  { login: "dinablin", enabled: false },
];

export const CLIPS_SETTINGS = {
  /** За какой период брать клипы. */
  lookbackHours: 48,
  /** Ограничения длительности исходного клипа, сек. */
  minDurationSec: 8,
  maxDurationSec: 60,
  /** Минимум просмотров клипа по умолчанию. */
  defaultMinClipViews: 300,
  /** Сколько клипов на стримера за запуск. */
  perStreamerLimit: 3,
  /** Папка для готовых роликов. */
  outputDir: process.env.CLIPS_OUTPUT_DIR || "output/clips",
  /** Видео мидрола Playerok (необязательно). */
  midrollPath: process.env.PLAYEROK_MIDROLL_PATH || "",
  /** Бинарник yt-dlp. Пусто: взять из PATH или скачать автоматически (см. download.ts). */
  ytDlpPath: process.env.YTDLP_PATH || "",
  /** Клипы длиннее этого режем через LLM до самого сильного куска. */
  llmTrimAboveSec: 20,
  /** Желаемая длина куска, который выбирает LLM, сек. */
  llmTargetMinSec: 7,
  llmTargetMaxSec: 20,
  /** Шрифт субтитров (должен поддерживать кириллицу). */
  subtitleFont: process.env.CLIPS_SUBTITLE_FONT || "Arial",
} as const;
