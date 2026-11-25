/**
 * Цензура мата в тексте (субтитры, заголовки): "блядь" → "б***ь".
 * Звук не трогаем, только текст: TikTok/Instagram режут охваты за мат в тексте.
 */

/** Приставки, с которыми встречается мат: "заебал", "нахуй", "отъебись". */
const PREFIX = "(?:за|на|по|от|отъ|у|вы|до|раз|разъ|рас|при|про|об|объ|съ|из|изъ|вз|въ|о|не|ни)?";

/** Корни. Привязаны к началу слова (после приставки), чтобы не задеть "тебе", "небо", "хлеб", "ребята". */
const ROOTS = [
  "ху[йеёияю]",
  "пизд",
  "бля",
  "еб(?!ол)[аеёиуолншы]",
  "ёб",
  "мудак",
  "мудил",
  "пид[оа]р",
  "залуп",
  "гандон",
  "сук[аиуе]$",
  "сучк",
];

const SWEAR = new RegExp(`^${PREFIX}(?:${ROOTS.join("|")})`, "i");

export function isSwear(word: string): boolean {
  return SWEAR.test(word.replace(/[^\p{L}]/gu, ""));
}

/** Оставляет первую и последнюю букву, середину заменяет звёздочками. Пунктуацию сохраняет. */
function maskWord(word: string): string {
  const letters = [...word].map((ch, i) => ({ ch, i })).filter(({ ch }) => /\p{L}/u.test(ch));
  if (letters.length < 3) return word.replace(/\p{L}/gu, "*");
  const keep = new Set([letters[0].i, letters[letters.length - 1].i]);
  return [...word].map((ch, i) => (/\p{L}/u.test(ch) && !keep.has(i) ? "*" : ch)).join("");
}

export function censorText(text: string): string {
  return text
    .split(/(\s+)/)
    .map((token) => (token.trim() && isSwear(token) ? maskWord(token) : token))
    .join("");
}
