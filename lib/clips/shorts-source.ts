/**
 * Источник для подборок: готовые YouTube Shorts с каналов-нарезчиков.
 * Список видео берём через yt-dlp (вкладка /shorts канала, новые сверху), API-ключ не нужен.
 */
import * as path from "path";
import { getMongoDatabase } from "@/lib/db/mongodb";
import { run } from "./ffmpeg";
import { resolveYtDlp } from "./download";

export interface ShortsChannel {
  /** YouTube channel id (UC...). */
  id: string;
  name: string;
  /** Стример, которого нарезает канал: для заголовков и подписи. */
  streamer: string;
  enabled: boolean;
}

/**
 * Отбор 2026-11-25 через scripts/shorts-discover.ts: нарезки русских стримов,
 * ≥5 шортсов за 14 дней, медиана ≥3K просмотров. Упорядочено по «просмотрам в день».
 * Обновлять тем же скриптом раз в 1-2 недели: клип-каналы быстро умирают.
 */
export const SHORTS_CHANNELS: ShortsChannel[] = [
  { id: "UCQFIxL0AYtgeAwxnqoeC1Yw", name: "Cybrix Нарезки Стинта", streamer: "Стинт", enabled: true },
  { id: "UClJN0qnO3sWU2iM19GJOr9A", name: "Нарезки T2x2 ► Кеплер", streamer: "T2x2", enabled: true },
  { id: "UC2unyTekgoScCatR4u-tq8w", name: "ХОЗЯЕВА - СТРИМ", streamer: "Хазяева", enabled: true },
  { id: "UCNPUUqi4kqjeaScWtsvfyvw", name: "Нарезки Стинта", streamer: "Стинт", enabled: true },
  { id: "UCe4qOizEHWkk2N9m3CyfI4Q", name: "Склад Левши", streamer: "Левша", enabled: true },
  { id: "UC5KD_Q_rS3lVfP_hMDZ3HwQ", name: "Нарезка Папича", streamer: "Папич", enabled: true },
  { id: "UCT8A7ODHja2tQDzKZuWIivw", name: "клипы кс2", streamer: "стримеры CS2", enabled: true },
  { id: "UCDqlBCW2D1CD8m49YDoEv4g", name: "Buster Rofls", streamer: "Бустер", enabled: true },
  { id: "UCt4XCfHJfFFhAx8BU4SH9tA", name: "Evelone Rofls", streamer: "Эвелон", enabled: true },
  { id: "UC2p47ZrM2ZdizmG4V7DATiQ", name: "SSaSke Нарезки", streamer: "разные стримеры", enabled: true },
  { id: "UCbuQYiZDUYWP0zllln5OP2Q", name: "Пещерка шнырей", streamer: "Нир", enabled: true },
  { id: "UCt7ac7KeYMKTgDBWmR8wC_Q", name: "UNDERVIEWED", streamer: "T2x2", enabled: true },
  { id: "UCidCStdwfDN-SXXOZUiPhxA", name: "Gensyxa Stream", streamer: "Генсуха", enabled: true },
  { id: "UCOWAfJ0fRfoxWlLD5JKjdwg", name: "ХАЗЯЕВА МОМЕНТС", streamer: "Хазяева", enabled: true },
  { id: "UC8LL8CMUqMVxp0zwhZ5eMhQ", name: "T2X2 Подслушано", streamer: "T2x2", enabled: true },
  { id: "UClscxd_kc0WcpdpA4rbvEQg", name: "ЮЕЧКА Twicher", streamer: "Юечка", enabled: true },
  { id: "UCtWBdKuazh9g5LGkZ_Wt5BQ", name: "CLIPS ROFLS", streamer: "разные стримеры", enabled: true },
  { id: "UCIoilSlYw5G-Cp8lV8KGdMw", name: "Кринж Дуо Нарезки", streamer: "разные стримеры", enabled: true },
  { id: "UCydActh6Uv9b1orr1H1l7fw", name: "Нарезки Миши Джуса", streamer: "Джус", enabled: true },
  { id: "UCIiWumgIirhR-7VOjr-DnwA", name: "Вырезчик Пятёрки", streamer: "Пятёрка", enabled: true },
  { id: "UC2RaD9y6Yp0oKM6zI2CuSYA", name: "PAPICH HUNT", streamer: "Папич", enabled: true },
  { id: "UCFCKCVXU8NlRVBohzlQQVaw", name: "Режу Твич", streamer: "разные стримеры", enabled: true },
  { id: "UCb-SQh-EzmM4PViGtD_42bg", name: "Твич моменты", streamer: "разные стримеры", enabled: true },
  // Неактивны: последние шортсы 2025 и 2022 года.
  { id: "UC4Vpj2ylOYAXR1mlop4_yqQ", name: "Twitch Squad", streamer: "Бустер и компания", enabled: false },
  { id: "UCD1ZqgNLVGLGKwBfjJ12VfA", name: "Zubarefff Rofls", streamer: "Зубарев", enabled: false },
];

export interface ShortCandidate {
  videoId: string;
  url: string;
  title: string;
  views: number;
  uploadDate: Date;
  channel: ShortsChannel;
  /** Просмотры относительно медианы канала: 3.0 = в 3 раза лучше обычного шортса канала. */
  score: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

export interface FeedVideo {
  videoId: string;
  title: string;
  views: number;
  published: Date;
  isShort: boolean;
}

const decodeXml = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * RSS канала: 15 последних видео с датой и просмотрами за один быстрый запрос, без yt-dlp.
 * Шортсы отличаем по ссылке /shorts/.
 */
export async function fetchChannelFeed(channelId: string): Promise<FeedVideo[]> {
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!response.ok) throw new Error(`RSS ${channelId}: ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => {
    const pick = (re: RegExp) => re.exec(entry)?.[1] ?? "";
    return {
      videoId: pick(/<yt:videoId>([^<]+)</),
      title: decodeXml(pick(/<title>([^<]*)</)),
      views: Number(pick(/<media:statistics views="(\d+)"/)) || 0,
      published: new Date(pick(/<published>([^<]+)</)),
      isShort: /href="https:\/\/www\.youtube\.com\/shorts\//.test(entry),
    };
  });
}

/** Свежие шортсы канала из RSS; score считается относительно медианы канала. */
export async function listChannelShorts(channel: ShortsChannel): Promise<ShortCandidate[]> {
  const shorts = (await fetchChannelFeed(channel.id)).filter((v) => v.isShort);
  const base = Math.max(1, median(shorts.map((r) => r.views)));
  return shorts.map((r) => ({
    videoId: r.videoId,
    url: `https://www.youtube.com/shorts/${r.videoId}`,
    title: r.title,
    views: r.views,
    uploadDate: r.published,
    channel,
    score: r.views / base,
  }));
}

/** Длительность без скачивания (в RSS её нет). */
export async function fetchShortDuration(candidate: ShortCandidate): Promise<number> {
  const out = await run(await resolveYtDlp(), [
    "--skip-download",
    "--no-warnings",
    "--print", "%(duration)s",
    candidate.url,
  ]);
  return Number(out.trim()) || 0;
}

/** Скачивает шортс в mp4. */
export async function downloadShort(candidate: ShortCandidate, workDir: string): Promise<string> {
  const out = path.join(workDir, `${candidate.videoId}-source.mp4`);
  await run(await resolveYtDlp(), [
    "--quiet",
    "--no-warnings",
    "-f", "bv*[ext=mp4][height<=1920]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
    "--merge-output-format", "mp4",
    "-o", out,
    candidate.url,
  ]);
  return out;
}

// ---------- дедупликация: один шортс попадает только в одну подборку ----------

interface UsedShortRecord {
  videoId: string;
  channelId: string;
  compilation: string;
  createdAt: Date;
}

async function usedCollection() {
  const db = await getMongoDatabase();
  const col = db.collection<UsedShortRecord>("yt_shorts_used");
  await col.createIndex({ videoId: 1 }, { unique: true });
  return col;
}

export async function filterUnused(candidates: ShortCandidate[]): Promise<ShortCandidate[]> {
  if (candidates.length === 0) return [];
  const col = await usedCollection();
  const used = await col.find({ videoId: { $in: candidates.map((c) => c.videoId) } }).toArray();
  const seen = new Set(used.map((u) => u.videoId));
  return candidates.filter((c) => !seen.has(c.videoId));
}

export async function markUsed(candidates: ShortCandidate[], compilation: string) {
  if (candidates.length === 0) return;
  const col = await usedCollection();
  const now = new Date();
  await col.bulkWrite(
    candidates.map((c) => ({
      updateOne: {
        filter: { videoId: c.videoId },
        update: { $setOnInsert: { videoId: c.videoId, channelId: c.channel.id, compilation, createdAt: now } },
        upsert: true,
      },
    }))
  );
}
