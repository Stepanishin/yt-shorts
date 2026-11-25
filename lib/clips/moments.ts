/**
 * Детектор моментов по всплескам чата (фаза 2, см. PLAN_CLIPS.md).
 *
 * Идея: момент интересен, если за 15 сек пишут в разы больше уникальных людей,
 * чем обычно за последние 10 минут, и среди сообщений много смеха или шока.
 */
import { BUCKET_SEC, chatBucketsCollection, type ChatBucket } from "./chat";

export interface Moment {
  channel: string;
  /** Начало 15-секундного окна с пиком реакции чата. */
  peak: Date;
  /** Отрезок для вырезки: чат реагирует с задержкой, поэтому берём до пика больше, чем после. */
  start: Date;
  end: Date;
  /** Во сколько раз активность выше обычной. */
  ratio: number;
  /** Доля смеха/шока в окне, 0..1. */
  reaction: number;
  /** Уникальных отправителей в окне. */
  users: number;
  score: number;
}

export interface MomentOptions {
  /** Окно всплеска, корзин (3 x 5 сек = 15 сек). */
  windowBuckets?: number;
  /** Окно для базовой активности, корзин (120 x 5 сек = 10 мин). */
  baselineBuckets?: number;
  /** Минимальное превышение над обычной активностью. */
  minRatio?: number;
  /** Минимум уникальных людей в окне, чтобы отсечь мелкие чаты. */
  minUsers?: number;
  /** Минимальная доля смеха/шока: отсекает всплески из-за розыгрышей, команд бота и т.п. */
  minReaction?: number;
  /** Сколько истории нужно для базы, корзин (60 x 5 сек = 5 мин). */
  minHistoryBuckets?: number;
  /** Минимальное расстояние между моментами, сек. */
  minGapSec?: number;
  /** Сколько секунд брать до и после пика. */
  beforeSec?: number;
  afterSec?: number;
}

const DEFAULTS: Required<MomentOptions> = {
  windowBuckets: 3,
  baselineBuckets: 120,
  minRatio: 2.5,
  minUsers: 8,
  minReaction: 0.08,
  minHistoryBuckets: 60,
  minGapSec: 90,
  beforeSec: 30,
  afterSec: 10,
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Чистая функция поиска пиков по корзинам одного канала (для тестов и отладки). */
export function detectMoments(channel: string, buckets: ChatBucket[], options: MomentOptions = {}): Moment[] {
  const o = { ...DEFAULTS, ...options };
  if (buckets.length === 0) return [];

  // Плотный ряд: пропуски (тишина в чате) заполняем нулями.
  const first = buckets[0].t.getTime();
  const last = buckets[buckets.length - 1].t.getTime();
  const size = Math.floor((last - first) / 1000 / BUCKET_SEC) + 1;
  const users = new Array<number>(size).fill(0);
  const msgs = new Array<number>(size).fill(0);
  const reacts = new Array<number>(size).fill(0);
  for (const b of buckets) {
    const i = Math.round((b.t.getTime() - first) / 1000 / BUCKET_SEC);
    users[i] += b.users;
    msgs[i] += b.n;
    reacts[i] += b.laugh + b.shock;
  }

  const sum = (arr: number[], from: number, to: number) => {
    let s = 0;
    for (let k = from; k < to; k++) s += arr[k];
    return s;
  };

  // Скользящие суммы по окну всплеска.
  const windows: number[] = [];
  for (let i = 0; i + o.windowBuckets <= size; i++) windows.push(sum(users, i, i + o.windowBuckets));

  const minHistory = Math.min(o.minHistoryBuckets, o.baselineBuckets);
  const candidates: Moment[] = [];
  for (let i = minHistory; i < windows.length; i++) {
    const history = windows.slice(Math.max(0, i - o.baselineBuckets), i - o.windowBuckets + 1);
    if (history.length < minHistory - o.windowBuckets) continue;
    const baseline = Math.max(median(history), 3);
    const current = windows[i];
    const ratio = current / baseline;
    if (ratio < o.minRatio || current < o.minUsers) continue;

    const n = sum(msgs, i, i + o.windowBuckets);
    const reaction = n > 0 ? sum(reacts, i, i + o.windowBuckets) / n : 0;
    if (reaction < o.minReaction) continue;
    const peak = first + i * BUCKET_SEC * 1000;
    candidates.push({
      channel,
      peak: new Date(peak),
      start: new Date(peak - o.beforeSec * 1000),
      end: new Date(peak + o.afterSec * 1000),
      ratio,
      reaction,
      users: current,
      // Реакция (смех/шок) весит не меньше объёма: всплеск "+" из-за розыгрыша нам не нужен.
      score: ratio * (0.3 + reaction),
    });
  }

  // Подавление соседей: из близких кандидатов оставляем самый сильный.
  candidates.sort((a, b) => b.score - a.score);
  const picked: Moment[] = [];
  for (const c of candidates) {
    if (picked.every((p) => Math.abs(p.peak.getTime() - c.peak.getTime()) >= o.minGapSec * 1000)) picked.push(c);
  }
  return picked;
}

/** Моменты канала за период по данным из MongoDB, отсортированы по силе. */
export async function findMoments(channel: string, from: Date, to: Date, options: MomentOptions = {}): Promise<Moment[]> {
  const o = { ...DEFAULTS, ...options };
  const col = await chatBucketsCollection();
  // Берём историю до начала периода, чтобы у первых минут была база для сравнения.
  const historyFrom = new Date(from.getTime() - o.baselineBuckets * BUCKET_SEC * 1000);
  const buckets = await col
    .find({ channel: channel.toLowerCase(), t: { $gte: historyFrom, $lte: to } }, { projection: { _id: 0 } })
    .sort({ t: 1 })
    .toArray();
  return detectMoments(channel, buckets, o).filter((m) => m.peak >= from);
}
