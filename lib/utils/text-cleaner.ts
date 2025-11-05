/**
 * Утилита для очистки HTML и удаления нежелательного контента из текстов анекдотов
 */

export interface CleanTextOptions {
  /** Удалять ли HTML-теги */
  stripHtml?: boolean;
  /** Удалять ли блоки голосования с эмоциями */
  removeEmotionVoting?: boolean;
  /** Удалять ли лишние пробелы и переносы строк */
  normalizeWhitespace?: boolean;
  /** Декодировать ли HTML-сущности */
  decodeEntities?: boolean;
}

/**
 * Очищает текст от HTML, виджетов голосования и другого мусора
 */
export const cleanText = (
  value: string,
  options: CleanTextOptions = {}
): string => {
  const {
    stripHtml = true,
    removeEmotionVoting = true,
    normalizeWhitespace = true,
    decodeEntities = true,
  } = options;

  let cleaned = value;

  if (stripHtml) {
    // Удаляем script и style теги вместе с содержимым
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  }

  if (removeEmotionVoting) {
    // Удаляем блоки с эмоциями и голосованием (Happy, Sad, Excited, etc.)
    // Паттерны: "Happy 5 %", "Sad 0 0 %", etc.
    cleaned = cleaned.replace(
      /\b(Happy|Sad|Excited|Sleepy|Angry|Surprise)\s*\d+\s*%/gi,
      ""
    );
    cleaned = cleaned.replace(
      /\b(Happy|Sad|Excited|Sleepy|Angry|Surprise)\s+\d+\s+\d+\s*%/gi,
      ""
    );

    // Удаляем отдельно стоящие названия эмоций
    cleaned = cleaned.replace(
      /\b(Happy|Sad|Excited|Sleepy|Angry|Surprise)\b/gi,
      ""
    );

    // Удаляем паттерны вида "0 %" или "0%" без контекста
    cleaned = cleaned.replace(/\s+\d+\s+%/g, "");
    cleaned = cleaned.replace(/\s+\d+\s*%/g, "");
  }

  if (stripHtml) {
    // Заменяем <br> на переносы строк
    cleaned = cleaned.replace(/<br\s*\/?>(\s*)/gi, "\n");

    // Удаляем все остальные HTML теги
    cleaned = cleaned.replace(/<[^>]+>/g, "");
  }

  if (decodeEntities) {
    // Декодируем HTML-сущности
    cleaned = cleaned.replace(/&nbsp;/g, " ");
    cleaned = cleaned.replace(/&amp;/g, "&");
    cleaned = cleaned.replace(/&quot;/g, '"');
    cleaned = cleaned.replace(/&#039;/g, "'");
    cleaned = cleaned.replace(/&apos;/g, "'");
    cleaned = cleaned.replace(/&lt;/g, "<");
    cleaned = cleaned.replace(/&gt;/g, ">");
  }

  if (normalizeWhitespace) {
    // Удаляем множественные пробелы и табуляции
    cleaned = cleaned.replace(/[ \t]+/g, " ");

    // Удаляем пробелы в начале и конце каждой строки
    cleaned = cleaned
      .split("\n")
      .map((line) => line.trim())
      .join("\n");

    // Удаляем множественные пустые строки, оставляя максимум одну пустую строку
    // (т.е. максимум два перевода строки подряд)
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  }

  return cleaned.trim();
};

/**
 * Быстрая версия очистки для HTML из источников анекдотов
 */
export const cleanJokeHtml = (html: string): string =>
  cleanText(html, {
    stripHtml: true,
    removeEmotionVoting: true,
    normalizeWhitespace: true,
    decodeEntities: true,
  });

/**
 * Очистка только от виджетов голосования (без удаления HTML)
 */
export const removeVotingWidgets = (text: string): string =>
  cleanText(text, {
    stripHtml: false,
    removeEmotionVoting: true,
    normalizeWhitespace: true,
    decodeEntities: false,
  });
