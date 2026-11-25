import { censorText, isSwear } from "./censor";

export interface PostText {
  title: string;
  description: string;
  hashtags: string[];
}

/** Заголовок и хэштеги для TikTok/Instagram на русском по транскрипту клипа. */
export async function generatePostText(params: {
  streamer: string;
  clipTitle: string;
  transcript: string;
}): Promise<PostText> {
  const fallback: PostText = {
    title: params.clipTitle.slice(0, 80),
    description: `Момент со стрима ${params.streamer}`,
    hashtags: [params.streamer.toLowerCase(), "стрим", "нарезки", "twitch"],
  };

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Ты делаешь короткие нарезки со стримов для TikTok и Instagram Reels.

Стример: ${params.streamer}
Название клипа на Twitch: ${params.clipTitle}
Что говорят в клипе (транскрипт, может быть неточным):
"""${params.transcript.slice(0, 1500)}"""

Придумай:
- title: цепляющий заголовок на русском, до 70 символов, 0-1 эмодзи. Не выдумывай того, чего нет в клипе. Без мата (если цитируешь, пиши со звёздочками: "б***ь").
- description: 1 короткое предложение, обязательно с именем стримера.
- hashtags: 4-6 хэштегов без символа #, на русском или латиницей, первый: ник стримера.

Ответь строго JSON: {"title": "...", "description": "...", "hashtags": ["..."]}`;

    const response = await openai.chat.completions.create({
      model: process.env.CLIPS_LLM_MODEL || "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as Partial<PostText>;
    if (!parsed.title) return fallback;
    return {
      title: censorText(parsed.title.slice(0, 90)),
      description: censorText(parsed.description ?? fallback.description),
      hashtags: (parsed.hashtags ?? fallback.hashtags)
        .map((h) => h.replace(/^#/, ""))
        .filter((h) => !isSwear(h))
        .slice(0, 6),
    };
  } catch (error) {
    console.error("⚠️ Post text generation failed, using fallback:", error);
    return fallback;
  }
}
