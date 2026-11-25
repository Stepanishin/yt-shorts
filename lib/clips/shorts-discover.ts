/**
 * Поиск каналов-нарезчиков для подборок.
 * 1) yt-dlp ищет на YouTube по запросам «<стример> нарезка / момент» и собирает id каналов;
 * 2) по RSS каждого канала считаем, сколько шортсов он выложил за последние дни и сколько они набирают.
 */
import { run } from "./ffmpeg";
import { resolveYtDlp } from "./download";
import { fetchChannelFeed } from "./shorts-source";

/** Крупные русскоязычные стримеры, вокруг которых живут клип-каналы. */
export const DISCOVERY_STREAMERS = [
  "бустер", "эвелон", "мокривский", "дилблин", "экзайл", "строго", "скайвокер", "стинт",
  "т2х2", "куся", "ликс", "рекрент", "хелйеах", "братишкин", "папич", "зубарев",
  "шадоукек", "меллстрой", "парадеевич", "генсуха", "юечка", "катя ekatze", "аункер",
  "морфи", "десаут", "кореш", "фриказ", "плохой парень", "кишки", "джов", "мазеллов",
  "фрейм тамер", "insize", "нелья", "акума", "голд", "пятёрка", "даша корейка",
  "лолоу", "квикхантик", "равшан", "злой", "сасавот", "лева2к", "кури", "хесус",
];

const QUERY_TEMPLATES = ["{s} нарезка shorts", "{s} смешной момент стрим"];
const GENERIC_QUERIES = [
  "нарезки стримов shorts", "смешные моменты со стрима shorts", "твич моменты shorts",
  "лучшие моменты твича shorts", "рофлы со стрима shorts", "стример момент shorts",
];

export interface ChannelStats {
  id: string;
  name: string;
  /** Сколько раз канал встретился в поиске. */
  hits: number;
  /** Шортсов за окно (по RSS, максимум 15 последних видео). */
  freshShorts: number;
  medianViews: number;
  maxViews: number;
  lastUpload: string;
  /** Ожидаемый объём «просмотров в день»: грубая метрика для ранжирования. */
  score: number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function searchChannels(query: string, perQuery: number): Promise<{ id: string; name: string }[]> {
  try {
    const out = await run(await resolveYtDlp(), [
      "--flat-playlist",
      "--no-warnings",
      "--print", "%(channel_id)s\t%(channel)s",
      `ytsearch${perQuery}:${query}`,
    ]);
    return out
      .trim()
      .split("\n")
      .map((line) => line.split("\t"))
      .filter(([id]) => id && id.startsWith("UC"))
      .map(([id, name]) => ({ id, name: name ?? id }));
  } catch {
    return [];
  }
}

export async function discoverChannels(opts: { windowDays?: number; perQuery?: number } = {}): Promise<ChannelStats[]> {
  const windowDays = opts.windowDays ?? 14;
  const queries = [
    ...DISCOVERY_STREAMERS.flatMap((s) => QUERY_TEMPLATES.map((t) => t.replace("{s}", s))),
    ...GENERIC_QUERIES,
  ];
  console.log(`🔎 ${queries.length} search queries`);
  const found = await mapLimit(queries, 8, (q) => searchChannels(q, opts.perQuery ?? 30));

  const channels = new Map<string, { name: string; hits: number }>();
  for (const { id, name } of found.flat()) {
    const entry = channels.get(id) ?? { name, hits: 0 };
    entry.hits++;
    channels.set(id, entry);
  }
  console.log(`📺 ${channels.size} unique channels, checking RSS`);

  const since = Date.now() - windowDays * 86400000;
  const stats = await mapLimit([...channels.entries()], 12, async ([id, { name, hits }]) => {
    const feed = await fetchChannelFeed(id).catch(() => []);
    const fresh = feed.filter((v) => v.isShort && v.published.getTime() >= since);
    const views = fresh.map((v) => v.views).sort((a, b) => a - b);
    const medianViews = views.length ? views[Math.floor(views.length / 2)] : 0;
    // Если все 15 видео в RSS свежие, реальный темп выше: экстраполируем по возрасту самого старого.
    const span = fresh.length
      ? Math.max(1, (Date.now() - Math.min(...fresh.map((v) => v.published.getTime()))) / 86400000)
      : windowDays;
    const perDay = fresh.length / Math.min(span, windowDays);
    return {
      id,
      name,
      hits,
      freshShorts: fresh.length,
      medianViews,
      maxViews: views[views.length - 1] ?? 0,
      lastUpload: feed[0]?.published.toISOString().slice(0, 10) ?? "",
      score: Math.round(perDay * medianViews),
    } satisfies ChannelStats;
  });

  return stats.sort((a, b) => b.score - a.score);
}
