import * as fs from "fs";
import * as path from "path";
import { ffmpeg } from "./ffmpeg";

export interface Word {
  word: string;
  start: number;
  end: number;
}

/** Транскрипция речи клипа с пословными таймкодами (OpenAI Whisper). */
export async function transcribeWords(videoPath: string, workDir: string, language = "ru"): Promise<Word[]> {
  const audioPath = path.join(workDir, `${path.basename(videoPath, ".mp4")}.mp3`);
  // Моно 64k mp3: минутный клип ~0.5 МБ, далеко от лимита Whisper в 25 МБ.
  await ffmpeg(["-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", audioPath]);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: fs.createReadStream(audioPath),
    language,
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  const words = ((response as unknown as { words?: Word[] }).words ?? [])
    .map((w) => ({ word: w.word.trim(), start: w.start, end: w.end }))
    .filter((w) => w.word.length > 0);
  return words;
}

export interface Caption {
  text: string;
  start: number;
  end: number;
}

/** Группирует слова в короткие титры: до 3 слов, разрыв по паузе > 0.6 сек. */
export function groupWords(words: Word[], maxWords = 3, maxGap = 0.6): Caption[] {
  const captions: Caption[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length === 0) return;
    captions.push({
      text: current.map((w) => w.word).join(" "),
      start: current[0].start,
      end: current[current.length - 1].end,
    });
    current = [];
  };
  for (const w of words) {
    const last = current[current.length - 1];
    if (current.length >= maxWords || (last && w.start - last.end > maxGap)) flush();
    current.push(w);
  }
  flush();
  return captions;
}
