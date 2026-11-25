import { spawn } from "child_process";

export function run(cmd: string, args: string[]): Promise<string> {
  return runCapture(cmd, args).then((r) => r.stdout);
}

/** Как run, но отдаёт и stderr: ffmpeg пишет туда результаты анализирующих фильтров (cropdetect и т.п.). */
export function runCapture(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

export const ffmpeg = (args: string[]) =>
  run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export async function probe(file: string): Promise<MediaInfo> {
  const out = await run(process.env.FFPROBE_PATH || "ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const data = JSON.parse(out) as {
    format: { duration?: string };
    streams: { codec_type: string; width?: number; height?: number }[];
  };
  const video = data.streams.find((s) => s.codec_type === "video");
  return {
    duration: Number(data.format.duration ?? 0),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    hasAudio: data.streams.some((s) => s.codec_type === "audio"),
  };
}
