import { load } from "cheerio";
import { cleanJokeHtml } from "@/lib/utils/text-cleaner";

const BASE_URL = "https://www.piada.com";
const DEFAULT_TIMEOUT_MS = 10000;

export interface PiadaComJoke {
  text: string;
  url: string;
  category?: string;
  id?: string;
}

export interface FetchPiadaComOptions {
  /** Category ID. Example: "08" for Diversos */
  category: string;
  /** Page number (pagination) */
  page?: number;
  /** Override base URL (for tests/proxy) */
  baseUrl?: string;
  /** Request timeout (ms) */
  timeoutMs?: number;
  /** Custom fetch implementation (for tests) */
  fetchImpl?: typeof fetch;
}

export interface FetchPiadaComSuccess {
  ok: true;
  jokes: PiadaComJoke[];
  meta: {
    url: string;
    category: string;
    page: number;
    durationMs: number;
  };
}

export interface FetchPiadaComError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchPiadaComResult = FetchPiadaComSuccess | FetchPiadaComError;

export async function fetchPiadaComCategory(
  options: FetchPiadaComOptions
): Promise<FetchPiadaComResult> {
  const {
    category,
    page = 1,
    baseUrl = BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  if (!category || typeof category !== "string") {
    return {
      ok: false,
      error: {
        message: "Category is required to fetch PIADA.COM jokes",
        url: "",
      },
    };
  }

  const targetUrl = buildCategoryUrl(baseUrl, category, page);

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
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        error: {
          message: `PIADA.COM responded with status ${response.status}`,
          status: response.status,
          url: targetUrl,
        },
      };
    }

    // PIADA.COM has double UTF-8 encoding issue
    // First decode as UTF-8 (gives us "Ã´" instead of "ô")
    const wrongHtml = await response.text();

    // Fix double encoding: treat the string as Latin-1 bytes and re-decode as UTF-8
    const bytes = new Uint8Array(wrongHtml.length);
    for (let i = 0; i < wrongHtml.length; i++) {
      bytes[i] = wrongHtml.charCodeAt(i) & 0xFF;
    }
    const html = new TextDecoder('utf-8').decode(bytes);

    const jokes = parseJokesFromHtml(html, targetUrl, category);

    return {
      ok: true,
      jokes,
      meta: {
        url: targetUrl,
        category,
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
          ? `Request to PIADA.COM timed out after ${timeoutMs}ms`
          : "Failed to fetch PIADA.COM category",
        url: targetUrl,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

const buildCategoryUrl = (base: string, category: string, page: number): string => {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;

  if (page === 1) {
    return `${normalizedBase}/busca_piadas.php?categoria=${category}`;
  } else {
    return `${normalizedBase}/busca_piadas.php?categoria=${category}&pg=${page}`;
  }
};

const parseJokesFromHtml = (html: string, url: string, category: string): PiadaComJoke[] => {
  const $ = load(html);
  const results: PiadaComJoke[] = [];

  // Remove scripts, styles
  $("script, style").remove();

  // PIADA.COM structure:
  // Each joke is in <article class="post">
  // Text is in <p class="excerpt-entry">
  // Category is in <div class="cat"><a>...</a></div>
  // ID is in the share link <a href="piada.php?i=ID&t=0">

  const $articles = $("article.post");

  console.log(`[PT/PIADA.COM] Found ${$articles.length} article elements on ${url}`);

  $articles.each((index, element) => {
    const $article = $(element);

    // Extract joke text from <p class="excerpt-entry">
    const $text = $article.find("p.excerpt-entry");
    let jokeText = $text.text().trim();

    // Extract joke ID from share link
    const shareLink = $article.find("a[href*='piada.php']").attr("href");
    const idMatch = shareLink?.match(/piada\.php\?i=(\d+)/);
    const jokeId = idMatch ? idMatch[1] : `${index + 1}`;

    // Extract category from <div class="cat">
    const $category = $article.find("div.cat a");
    const jokeCategory = $category.text().trim() || category;

    // Clean the joke text
    jokeText = cleanJokeHtml(jokeText);

    // Filter criteria
    if (jokeText.length < 50) return; // Skip very short texts
    if (jokeText.length > 1000) return; // Skip very long texts

    // Skip if contains navigation or meta keywords
    if (
      jokeText.includes("PIADA.COM") ||
      jokeText.includes("Compartilhe") ||
      jokeText.toLowerCase().includes("navegação") ||
      jokeText.toLowerCase().includes("página")
    ) {
      return;
    }

    results.push({
      text: jokeText,
      url: `https://www.piada.com/piada.php?i=${jokeId}`,
      category: jokeCategory,
      id: jokeId,
    });
  });

  console.log(`[PT/PIADA.COM] Parsed ${results.length} jokes from ${url}`);
  return results;
};
