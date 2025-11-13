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

    // Удаляем строки состоящие только из одиночных цифр и пробелов
    cleaned = cleaned.replace(/^[\d\s]+$/gm, "");
  }

  if (stripHtml) {
    // Заменяем <br> на переносы строк
    cleaned = cleaned.replace(/<br\s*\/?>(\s*)/gi, "\n");

    // Удаляем все остальные HTML теги
    cleaned = cleaned.replace(/<[^>]+>/g, "");
  }

  if (decodeEntities) {
    // Декодируем HTML-сущности (именованные)
    cleaned = cleaned.replace(/&nbsp;/g, " ");
    cleaned = cleaned.replace(/&amp;/g, "&");
    cleaned = cleaned.replace(/&quot;/g, '"');
    cleaned = cleaned.replace(/&#039;/g, "'");
    cleaned = cleaned.replace(/&apos;/g, "'");
    cleaned = cleaned.replace(/&lt;/g, "<");
    cleaned = cleaned.replace(/&gt;/g, ">");
    cleaned = cleaned.replace(/&mdash;/g, "—");
    cleaned = cleaned.replace(/&ndash;/g, "–");
    cleaned = cleaned.replace(/&hellip;/g, "…");
    cleaned = cleaned.replace(/&laquo;/g, "«");
    cleaned = cleaned.replace(/&raquo;/g, "»");

    // Декодируем числовые HTML-сущности (&#8211; -> –, &#8230; -> …, etc.)
    cleaned = cleaned.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    });

    // Декодируем hex HTML-сущности (&#x2013; -> –, etc.)
    cleaned = cleaned.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }

  if (normalizeWhitespace) {
    // Удаляем множественные пробелы и табуляции
    cleaned = cleaned.replace(/[ \t]+/g, " ");

    // Удаляем пробелы в начале и конце каждой строки
    // И удаляем строки, которые содержат только цифры, пробелы и знаки процента
    cleaned = cleaned
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => {
        // Удаляем пустые строки И строки состоящие только из цифр/пробелов
        if (line === "") return true; // Сохраняем пустые строки для форматирования
        // Удаляем строки вида "0", "0 %", "0 0 %", etc.
        return !/^[\d\s%]+$/.test(line);
      })
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
