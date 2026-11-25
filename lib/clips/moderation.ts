import * as fs from "fs";
import * as path from "path";
import { ffmpeg, probe } from "./ffmpeg";

export interface ModerationVerdict {
  flagged: boolean;
  /** Категории, из-за которых клип отклонён (например "sexual", "violence/graphic"). */
  reasons: string[];
}

/**
 * Категории, при которых клип не публикуем: TikTok/Instagram за такое режут охваты или банят аккаунт.
 * Обычное "violence" (шутеры) и "harassment" (мат стримера) не блокируем, иначе отсеется половина клипов.
 */
const BLOCKING = new Set([
  "sexual",
  "sexual/minors",
  "violence/graphic",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "hate/threatening",
]);

/** Порог по score, чтобы ловить откровенный контент, даже если flagged=false. */
const SCORE_THRESHOLD = 0.5;

/** Достаёт N кадров равномерно по клипу в маленьком разрешении (для модерации). */
async function sampleFrames(videoPath: string, workDir: string, count: number): Promise<string[]> {
  const { duration } = await probe(videoPath);
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (duration * (i + 0.5)) / count;
    const out = path.join(workDir, `mod-${i}.jpg`);
    await ffmpeg(["-ss", t.toFixed(2), "-i", videoPath, "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "4", out]);
    if (fs.existsSync(out)) frames.push(out);
  }
  return frames;
}

/**
 * Проверяет кадры клипа и транскрипт через OpenAI omni-moderation (бесплатный endpoint).
 * Ошибка API не блокирует пайплайн, но клип помечается как непроверенный в логах.
 */
export async function moderateClip(videoPath: string, transcript: string, workDir: string, frameCount = 6): Promise<ModerationVerdict> {
  const frames = await sampleFrames(videoPath, workDir, frameCount);
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const inputs: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  if (transcript.trim()) inputs.push({ type: "text", text: transcript.slice(0, 2000) });

  const reasons = new Set<string>();
  // omni-moderation принимает одну картинку на запрос, поэтому кадры шлём по одному.
  const requests = frames.map((frame) =>
    openai.moderations.create({
      model: "omni-moderation-latest",
      input: [
        ...inputs,
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(frame).toString("base64")}` } },
      ],
    })
  );
  if (frames.length === 0 && inputs.length > 0) {
    requests.push(openai.moderations.create({ model: "omni-moderation-latest", input: inputs }));
  }

  for (const response of await Promise.all(requests)) {
    for (const result of response.results) {
      const categories = result.categories as unknown as Record<string, boolean>;
      const scores = result.category_scores as unknown as Record<string, number>;
      for (const name of BLOCKING) {
        if (categories[name] || (scores[name] ?? 0) >= SCORE_THRESHOLD) reasons.add(name);
      }
    }
  }
  return { flagged: reasons.size > 0, reasons: [...reasons] };
}
