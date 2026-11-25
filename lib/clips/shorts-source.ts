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

/** Отбор 2026-11-25: активные каналы, Shorts набирают 10K-200K+. */
export const SHORTS_CHANNELS: ShortsChannel[] = [
  { id: "UCDqlBCW2D1CD8m49YDoEv4g", name: "Buster Rofls", streamer: "Бустер", enabled: true },
  { id: "UCt4XCfHJfFFhAx8BU4SH9tA", name: "Evelone Rofls", streamer: "Эвелон", enabled: true },
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
  channel: ShortsChannel;
  /** Просмотры относительно медианы канала: 3.0 = в 3 раза лучше обычного шортса канала. */
  score: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

/** Последние N шортсов канала с просмотрами. */
export async function listChannelShorts(channel: ShortsChannel, recent = 30): Promise<ShortCandidate[]> {
  const out = await run(await resolveYtDlp(), [
    "--flat-playlist",
    "--playlist-end", String(recent),
    "--no-warnings",
    "--print", "%(id)s\t%(view_count)s\t%(title)s",
    `https://www.youtube.com/channel/${channel.id}/shorts`,
  ]);
  const rows = out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [videoId, views, ...title] = line.split("\t");
      return { videoId, views: Number(views) || 0, title: title.join("\t") };
    });
  const base = Math.max(1, median(rows.map((r) => r.views)));
  return rows.map((r) => ({
    videoId: r.videoId,
    url: `https://www.youtube.com/shorts/${r.videoId}`,
    title: r.title,
    views: r.views,
    channel,
    score: r.views / base,
  }));
}

/** Дата загрузки и длительность без скачивания (во flat-списке их нет). */
export async function fetchShortMeta(candidate: ShortCandidate): Promise<{ uploadDate: Date | null; duration: number }> {
  const out = await run(await resolveYtDlp(), [
    "--skip-download",
    "--no-warnings",
    "--print", "%(upload_date)s\t%(duration)s",
    candidate.url,
  ]);
  const [date, duration] = out.trim().split("\t");
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(date ?? "");
  return {
    uploadDate: m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null,
    duration: Number(duration) || 0,
  };
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
