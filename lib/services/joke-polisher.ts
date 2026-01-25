import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type SupportedLanguage = "es" | "de" | "pt" | "fr";

export interface PolishedJoke {
  text: string;
  originalText: string;
  language: SupportedLanguage;
  wasModified: boolean;
}

const LANGUAGE_CONFIG: Record<
  SupportedLanguage,
  { name: string; systemPrompt: string }
> = {
  es: {
    name: "Spanish",
    systemPrompt:
      "Eres un editor profesional de textos en español. Tu especialidad es corregir chistes y textos humorísticos manteniendo su esencia y gracia.",
  },
  de: {
    name: "German",
    systemPrompt:
      "Du bist ein professioneller Texteditor für Deutsch. Deine Spezialität ist das Korrigieren von Witzen und humoristischen Texten unter Beibehaltung ihrer Essenz und ihres Witzes.",
  },
  pt: {
    name: "Portuguese",
    systemPrompt:
      "Você é um editor profissional de textos em português. Sua especialidade é corrigir piadas e textos humorísticos mantendo sua essência e graça.",
  },
  fr: {
    name: "French",
    systemPrompt:
      "Vous êtes un éditeur professionnel de textes en français. Votre spécialité est de corriger les blagues et les textes humoristiques tout en préservant leur essence et leur humour.",
  },
};

/**
 * Полирует текст шутки через GPT:
 * - Исправляет орфографические ошибки
 * - Исправляет пунктуацию
 * - Форматирует переносы строк (диалоги, паузы перед панчлайном)
 */
export async function polishJokeText(
  text: string,
  language: SupportedLanguage
): Promise<PolishedJoke> {
  const originalText = text;
  const config = LANGUAGE_CONFIG[language];

  try {
    const prompt = `Отредактируй этот текст шутки на языке ${config.name}:

"""
${text}
"""

ЗАДАЧИ:
1. Исправь все орфографические ошибки
2. Исправь пунктуацию (запятые, точки, тире, кавычки)
3. Расставь переносы строк логично:
   - Каждая реплика диалога на отдельной строке
   - Пустая строка перед панчлайном/развязкой для драматической паузы
   - Если есть "сетап -> панчлайн", раздели их пустой строкой
4. Убери лишние пробелы и переносы
5. НЕ МЕНЯЙ смысл, слова или стиль шутки
6. НЕ ДОБАВЛЯЙ ничего нового (эмодзи, комментарии)

ВАЖНО: Верни ТОЛЬКО исправленный текст шутки, без кавычек, пояснений или комментариев.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: config.systemPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3, // Низкая температура для консистентности
      max_tokens: 1000,
    });

    const polishedText = response.choices[0]?.message?.content?.trim();

    if (!polishedText) {
      console.warn(
        `[JokePolisher] No response from GPT for ${language}, returning original`
      );
      return {
        text: originalText,
        originalText,
        language,
        wasModified: false,
      };
    }

    const wasModified = polishedText !== originalText;

    if (wasModified) {
      console.log(
        `[JokePolisher] Text modified for ${language}:`,
        `\n  Original (${originalText.length} chars): "${originalText.substring(0, 50)}..."`,
        `\n  Polished (${polishedText.length} chars): "${polishedText.substring(0, 50)}..."`
      );
    }

    return {
      text: polishedText,
      originalText,
      language,
      wasModified,
    };
  } catch (error) {
    console.error(`[JokePolisher] Error polishing joke (${language}):`, error);
    // Fallback - возвращаем оригинал
    return {
      text: originalText,
      originalText,
      language,
      wasModified: false,
    };
  }
}

/**
 * Batch-версия для обработки нескольких шуток
 */
export async function polishJokesBatch(
  jokes: { text: string; id?: string }[],
  language: SupportedLanguage
): Promise<(PolishedJoke & { id?: string })[]> {
  const results = await Promise.all(
    jokes.map(async (joke) => {
      const polished = await polishJokeText(joke.text, language);
      return { ...polished, id: joke.id };
    })
  );

  const modifiedCount = results.filter((r) => r.wasModified).length;
  console.log(
    `[JokePolisher] Batch complete: ${modifiedCount}/${jokes.length} jokes modified`
  );

  return results;
}
