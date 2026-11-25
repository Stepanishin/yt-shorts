import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { run } from "./ffmpeg";
import { CLIPS_SETTINGS } from "./config";

/** Перекачиваем бинарник раз в неделю: Twitch периодически ломает старые версии yt-dlp. */
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function releaseAsset(): string {
  if (process.platform === "darwin") return "yt-dlp_macos";
  if (process.platform === "linux") return process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
  throw new Error(`yt-dlp auto-download is not supported on ${process.platform}; set YTDLP_PATH`);
}

async function works(bin: string): Promise<boolean> {
  try {
    await run(bin, ["--version"]);
    return true;
  } catch {
    return false;
  }
}

let resolved: Promise<string> | null = null;

/**
 * Путь к yt-dlp:
 * 1) YTDLP_PATH из env, если задан;
 * 2) yt-dlp из PATH, если установлен;
 * 3) иначе скачивает официальный standalone-бинарник в ~/.cache/yt-dlp (работает и на DigitalOcean без apt).
 */
export function resolveYtDlp(): Promise<string> {
  resolved ??= (async () => {
    if (CLIPS_SETTINGS.ytDlpPath) return CLIPS_SETTINGS.ytDlpPath;
    if (await works("yt-dlp")) return "yt-dlp";

    const dir = path.join(os.homedir(), ".cache", "yt-dlp");
    const bin = path.join(dir, "yt-dlp");
    const fresh = fs.existsSync(bin) && Date.now() - fs.statSync(bin).mtimeMs < MAX_AGE_MS;
    if (!fresh) {
      fs.mkdirSync(dir, { recursive: true });
      const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${releaseAsset()}`;
      console.log(`  ⬇️  Downloading yt-dlp (${releaseAsset()})`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`yt-dlp download failed: ${response.status}`);
      const tmp = `${bin}.tmp`;
      fs.writeFileSync(tmp, Buffer.from(await response.arrayBuffer()));
      fs.chmodSync(tmp, 0o755);
      fs.renameSync(tmp, bin);
    }
    return bin;
  })().catch((error) => {
    resolved = null;
    throw error;
  });
  return resolved;
}

/** Скачивает клип Twitch в mp4 через yt-dlp. Возвращает путь к файлу. */
export async function downloadClip(clipUrl: string, clipId: string, workDir: string): Promise<string> {
  const out = path.join(workDir, `${clipId}-source.mp4`);
  await run(await resolveYtDlp(), [
    "--quiet",
    "--no-warnings",
    "-f", "best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "-o", out,
    clipUrl,
  ]);
  return out;
}
