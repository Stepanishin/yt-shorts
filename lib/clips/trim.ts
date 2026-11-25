import { CLIPS_SETTINGS } from "./config";
import type { Word } from "./transcribe";

export interface Segment {
  start: number;
  end: number;
  /** Как выбран отрезок: целиком, подрезка по речи или выбор LLM. */
  method: "full" | "speech" | "llm";
  reason?: string;
}

/** Запас до первого слова и после последнего, чтобы не обрезать вдох и реакцию. */
const LEAD_IN = 0.3;
const TAIL = 0.6;
/** Подрезаем только если экономим хотя бы столько секунд. */
const MIN_SAVING = 0.8;

/** Пункт 1. Убирает тишину в начале и в конце клипа по таймкодам слов Whisper. */
export function speechTrim(words: Word[], duration: number): Segment {
  if (words.length === 0) return { start: 0, end: duration, method: "full" };
  const start = Math.max(0, words[0].start - LEAD_IN);
  const end = Math.min(duration, words[words.length - 1].end + TAIL);
  if (start + (duration - end) < MIN_SAVING || end - start < CLIPS_SETTINGS.minDurationSec) {
    return { start: 0, end: duration, method: "full" };
  }
  return { start, end, method: "speech" };
}

/** Фразы с таймкодами для промпта: режем по паузам > 0.5 сек или по 12 слов. */
function phrases(words: Word[]): string {
  const lines: string[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length === 0) return;
    lines.push(`[${current[0].start.toFixed(1)}-${current[current.length - 1].end.toFixed(1)}] ${current.map((w) => w.word).join(" ")}`);
    current = [];
  };
  for (const w of words) {
    const last = current[current.length - 1];
    if (current.length >= 12 || (last && w.start - last.end > 0.5)) flush();
    current.push(w);
  }
  flush();
  return lines.join("\n");
}

/**
 * Пункт 2. LLM выбирает самый сильный кусок длинного клипа по транскрипту.
 * Границы привязываются к словам, чтобы не резать фразу посередине.
 * Возвращает null, если LLM считает, что резать не нужно (например, момент без слов).
 */
export async function llmSegment(params: {
  words: Word[];
  duration: number;
  clipTitle: string;
  streamer: string;
  hint?: string;
}): Promise<Segment | null> {
  const { words, duration } = params;
  const { llmTargetMinSec: minLen, llmTargetMaxSec: maxLen } = CLIPS_SETTINGS;
  if (words.length < 5) return null;

  const prompt = `Ты монтажёр коротких нарезок со стримов для TikTok и Reels.
Зрители досматривают ролик, только если он начинается сразу с действия и заканчивается сразу после панчлайна или реакции.

Стример: ${params.streamer}
Название клипа (его дал зритель, часто описывает суть момента): ${params.clipTitle}
Длина клипа: ${duration.toFixed(1)} сек.
${params.hint ? `Подсказка: ${params.hint}\n` : ""}Транскрипт с таймкодами в секундах (Whisper, может быть неточным):
${phrases(words)}

Выбери один непрерывный отрезок длиной ${minLen}-${maxLen} сек, где есть завязка и кульминация момента из названия.
- start: начало фразы, с которой понятен контекст (не с середины мысли).
- end: конец панчлайна или реакции, плюс 1 сек на эмоцию.
- Если суть момента в действии без слов, или весь клип и так плотный, верни keep_full: true.

Ответь строго JSON: {"keep_full": false, "start": 0.0, "end": 0.0, "reason": "кратко, почему"}`;

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: process.env.CLIPS_LLM_MODEL || "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
      keep_full?: boolean;
      start?: number;
      end?: number;
      reason?: string;
    };
    if (parsed.keep_full || typeof parsed.start !== "number" || typeof parsed.end !== "number") return null;

    // Привязка к словам: начало к началу ближайшего слова, конец к концу ближайшего слова.
    const first = words.reduce((best, w) => (Math.abs(w.start - parsed.start!) < Math.abs(best.start - parsed.start!) ? w : best));
    const last = words.reduce((best, w) => (Math.abs(w.end - parsed.end!) < Math.abs(best.end - parsed.end!) ? w : best));
    const start = Math.max(0, first.start - LEAD_IN);
    // LLM просили добавить секунду на реакцию: оставляем её, если она за пределами последнего слова.
    const end = Math.min(duration, Math.max(last.end + TAIL, parsed.end));
    const length = end - start;
    if (length < minLen - 1 || length > maxLen + 5) return null;
    return { start, end, method: "llm", reason: parsed.reason };
  } catch (error) {
    console.error("⚠️ LLM segment selection failed, falling back to speech trim:", error);
    return null;
  }
}

/** Выбор отрезка: LLM для длинных клипов, иначе (или при отказе LLM) подрезка по речи. */
export async function chooseSegment(params: {
  words: Word[];
  duration: number;
  clipTitle: string;
  streamer: string;
  hint?: string;
}): Promise<Segment> {
  if (params.duration > CLIPS_SETTINGS.llmTrimAboveSec) {
    const segment = await llmSegment(params);
    if (segment) return segment;
  }
  return speechTrim(params.words, params.duration);
}

/** Слова внутри отрезка со сдвигом таймкодов к его началу. */
export function shiftWords(words: Word[], segment: Segment): Word[] {
  return words
    .filter((w) => w.end > segment.start && w.start < segment.end)
    .map((w) => ({
      word: w.word,
      start: Math.max(0, w.start - segment.start),
      end: Math.min(segment.end, w.end) - segment.start,
    }));
}
