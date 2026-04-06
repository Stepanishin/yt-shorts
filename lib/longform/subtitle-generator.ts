import * as fs from "fs";
import * as path from "path";

export interface Subtitle {
  index: number;
  start: number; // seconds
  end: number; // seconds
  text: string;
}

/**
 * Generate time-synced subtitles from TTS audio using OpenAI Whisper API.
 * Since we generated the audio from known text, Whisper gives very accurate timestamps.
 */
export async function generateSubtitles(
  audioPath: string
): Promise<Subtitle[]> {
  console.log(`📝 Generating subtitles via Whisper...`);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const audioFile = fs.createReadStream(audioPath);

  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: audioFile,
    language: "es",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  const segments = (response as any).segments || [];

  const subtitles: Subtitle[] = segments.map((seg: any, i: number) => ({
    index: i + 1,
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
  }));

  console.log(`✅ Generated ${subtitles.length} subtitle segments`);

  return subtitles;
}

/**
 * Generate subtitles from known scene durations (alternative to Whisper).
 * Splits narration text into chunks timed to scene durations.
 * Useful as a fallback or when we already know per-scene timings.
 */
export function generateSubtitlesFromScenes(
  scenes: { narrationText: string; startTime: number; endTime: number }[]
): Subtitle[] {
  const subtitles: Subtitle[] = [];
  let index = 1;

  for (const scene of scenes) {
    // Split narration into sentences
    const sentences = scene.narrationText
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);

    const sceneDuration = scene.endTime - scene.startTime;
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
    let currentTime = scene.startTime;

    for (const sentence of sentences) {
      // Distribute time proportional to character count
      const sentenceDuration = (sentence.length / totalChars) * sceneDuration;

      subtitles.push({
        index: index++,
        start: currentTime,
        end: currentTime + sentenceDuration,
        text: sentence.trim(),
      });

      currentTime += sentenceDuration;
    }
  }

  return subtitles;
}

/**
 * Convert subtitles to SRT format string
 */
export function subtitlesToSRT(subtitles: Subtitle[]): string {
  return subtitles
    .map((sub) => {
      const startTime = formatSRTTime(sub.start);
      const endTime = formatSRTTime(sub.end);
      return `${sub.index}\n${startTime} --> ${endTime}\n${sub.text}\n`;
    })
    .join("\n");
}

/**
 * Save subtitles as SRT file
 */
export function saveSRTFile(subtitles: Subtitle[], outputPath: string): void {
  const srtContent = subtitlesToSRT(subtitles);
  fs.writeFileSync(outputPath, srtContent, "utf-8");
  console.log(`💾 SRT saved: ${outputPath} (${subtitles.length} segments)`);
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(ms)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}
