import { load } from "cheerio";

const BASE_URL = "https://chistes.yavendras.com";
const DEFAULT_TIMEOUT_MS = 10000;

export interface YavendrasJokeSummary {
  title: string;
  text: string;
  url: string;
  ratingPercent?: number;
  votesTotal?: number;
  votesPositive?: number;
  votesNegative?: number;
}

export interface FetchYavendrasCategoryOptions {
  /** Категория/slug без расширения. Например: "pepito", "chistes", "chistes-cortos" */
  slug: string;
  /** Страница (1 по умолчанию). На Yavendras используется параметр `?pag=` */
  page?: number;
  /** Переопределить базовый URL (для тестов/прокси) */
  baseUrl?: string;
  /** Таймаут запроса (мс) */
  timeoutMs?: number;
  /** Пользовательская реализация fetch (для тестов) */
  fetchImpl?: typeof fetch;
}

export interface FetchYavendrasCategorySuccess {
  ok: true;
  jokes: YavendrasJokeSummary[];
  meta: {
    url: string;
    slug: string;
    page: number;
    durationMs: number;
  };
}

export interface FetchYavendrasCategoryError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchYavendrasCategoryResult =
  | FetchYavendrasCategorySuccess
  | FetchYavendrasCategoryError;

export async function fetchYavendrasCategory(
  options: FetchYavendrasCategoryOptions
): Promise<FetchYavendrasCategoryResult> {
  const {
    slug,
    page = 1,
    baseUrl = BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  if (!slug || typeof slug !== "string") {
    return {
      ok: false,
      error: {
        message: "Slug is required to fetch Yavendras category",
        url: "",
      },
    };
  }

  const targetUrl = buildCategoryUrl(baseUrl, slug, page);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    const response = await fetchImpl(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ShortsGeneratorBot/1.0; +https://example.com/bot)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es;q=0.9,en;q=0.7",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        error: {
          message: `Yavendras responded with status ${response.status}`,
          status: response.status,
          url: targetUrl,
        },
      };
    }

    const html = await response.text();
    const jokes = parseJokesFromHtml(html, baseUrl);

    return {
      ok: true,
      jokes,
      meta: {
        url: targetUrl,
        slug,
        page,
        durationMs,
      },
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: isAbort
          ? `Request to Yavendras timed out after ${timeoutMs}ms`
          : "Failed to fetch Yavendras category",
        url: targetUrl,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

const buildCategoryUrl = (base: string, slug: string, page: number): string => {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const cleanedSlug = slug.replace(/\.php$/i, "");
  const path = `${normalizedBase}/${cleanedSlug}.php`;
  const url = new URL(path);

  if (page && Number.isFinite(page) && page > 1) {
    url.searchParams.set("pag", String(page));
  }

  return url.toString();
};

const parseJokesFromHtml = (html: string, baseUrl: string): YavendrasJokeSummary[] => {
  const $ = load(html);
  const sections = $("section.search-result-item");

  if (!sections.length) {
    return [];
  }

  const results: YavendrasJokeSummary[] = [];

  sections.each((_, element) => {
    const section = $(element);
    const titleNode = section.find("h4.search-result-item-heading a").first();
    const descriptionNode = section.find("p.description").first();

    const title = titleNode.text().trim();
    const href = titleNode.attr("href")?.trim();
    const rawHtml = descriptionNode.html();
    const textRaw = (rawHtml ?? descriptionNode.text() ?? "")
      .replace(/<br\s*\/?>(\s*)/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (!title || !href || !textRaw) {
      return;
    }

    const absoluteUrl = normalizeUrl(href, baseUrl);

    const ratingPercent = parsePercentage(section.find('[id^="resVotos_"]').first());
    const votesTotal = parseNumber(section.find("div.blue:contains('Votos totales') b").first().text());
    const votesPositive = parseVoteCount(section, "Positivo");
    const votesNegative = parseVoteCount(section, "Negativo");

    results.push({
      title,
      text: textRaw,
      url: absoluteUrl,
      ratingPercent,
      votesTotal,
      votesPositive,
      votesNegative,
    });
  });

  return results;
};

const normalizeUrl = (href: string, baseUrl: string): string => {
  if (!href) {
    return baseUrl;
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  if (href.startsWith("//")) {
    return `https:${href}`;
  }

  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(href.replace(/^\/\//, ""), base).toString();
};

const parsePercentage = (
  element: ReturnType<typeof load>["prototype"],
  defaultValue?: number
): number | undefined => {
  const text = element.text().trim();
  if (!text) {
    return defaultValue;
  }

  const match = text.match(/([0-9]+(?:[.,][0-9]+)?)%/);
  if (!match) {
    return defaultValue;
  }

  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : defaultValue;
};

const parseNumber = (text: string | undefined): number | undefined => {
  if (!text) {
    return undefined;
  }

  const cleaned = text.replace(/[^0-9.,-]/g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
};

const parseVoteCount = (
  section: ReturnType<typeof load>["prototype"],
  type: "Positivo" | "Negativo"
) => {
  try {
    const icon = section.find(`i[id^="Chistes_${type}_"]`).first();
    if (!icon.length) {
      return undefined;
    }

    const title = icon.attr("title") || "";
    const match = title.match(/\((\d+)\)/);
    if (!match) {
      return undefined;
    }

    const value = Number(match[1]);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

