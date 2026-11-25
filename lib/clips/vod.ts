/**
 * Записи эфиров (VOD) Twitch: поиск записи по времени и скачивание куска.
 */
import * as fs from "fs";
import * as path from "path";
import { run } from "./ffmpeg";
import { resolveYtDlp } from "./download";
import { helix } from "./twitch";

export interface TwitchVideo {
  id: string;
  stream_id: string | null;
  user_login: string;
  title: string;
  created_at: string;
  duration: string;
  url: string;
}

/** "5h43m49s" → секунды. */
export function parseTwitchDuration(value: string): number {
  const m = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(value);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export async function getArchiveVideos(broadcasterId: string, first = 5): Promise<TwitchVideo[]> {
  const data = await helix<{ data: TwitchVideo[] }>("/videos", {
    user_id: broadcasterId,
    type: "archive",
    first: String(first),
  });
  return data.data;
}

/** Запись, в которую попадает момент времени, и смещение от её начала в секундах. */
export function locateInVods(videos: TwitchVideo[], at: Date): { video: TwitchVideo; offset: number } | null {
  for (const video of videos) {
    const start = new Date(video.created_at).getTime();
    // У идущего эфира duration растёт: даём запас 10 минут на задержку обновления.
    const end = start + (parseTwitchDuration(video.duration) + 600) * 1000;
    const t = at.getTime();
    if (t >= start && t <= end) return { video, offset: (t - start) / 1000 };
  }
  return null;
}

function hms(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Скачивает кусок записи [startSec, endSec] в mp4 (до 1080p). */
export async function downloadVodSection(
  videoId: string,
  startSec: number,
  endSec: number,
  workDir: string
): Promise<string> {
  const base = path.join(workDir, `vod-${videoId}-${Math.floor(startSec)}`);
  await run(await resolveYtDlp(), [
    "--quiet",
    "--no-warnings",
    "-f", "best[height<=1080]/best",
    "--download-sections", `*${hms(startSec)}-${hms(endSec)}`,
    "--remux-video", "mp4",
    "-o", `${base}.%(ext)s`,
    `https://www.twitch.tv/videos/${videoId}`,
  ]);
  const file = fs.readdirSync(workDir).find((f) => f.startsWith(path.basename(base)) && f.endsWith(".mp4"));
  if (!file) throw new Error(`VOD section not downloaded: ${videoId} ${hms(startSec)}`);
  return path.join(workDir, file);
}

export function vodUrlAt(videoId: string, offsetSec: number): string {
  const s = Math.max(0, Math.floor(offsetSec));
  return `https://www.twitch.tv/videos/${videoId}?t=${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m${s % 60}s`;
}
