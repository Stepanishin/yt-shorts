import { load } from "cheerio";
import { cleanJokeHtml } from "@/lib/utils/text-cleaner";

const BASE_URL = "https://blague-humour.com";
const DEFAULT_TIMEOUT_MS = 10000;

export interface BlagueHumourJoke {
  text: string;
  url: string;
  category?: string;
  title?: string;
  id?: string;
}

export interface FetchBlagueHumourOptions {
  /** Category slug. Example: "blague-toto" for Toto jokes */
  category?: string;
  /** Page number (pagination) */
  page?: number;
  /** Override base URL (for tests/proxy) */
  baseUrl?: string;
  /** Request timeout (ms) */
  timeoutMs?: number;
  /** Custom fetch implementation (for tests) */
  fetchImpl?: typeof fetch;
}

export interface FetchBlagueHumourSuccess {
  ok: true;
  jokes: BlagueHumourJoke[];
  meta: {
    url: string;
    category?: string;
    page: number;
    durationMs: number;
  };
}

export interface FetchBlagueHumourError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchBlagueHumourResult = FetchBlagueHumourSuccess | FetchBlagueHumourError;

export async function fetchBlagueHumourCategory(
  options: FetchBlagueHumourOptions
): Promise<FetchBlagueHumourResult> {
  const {
    category,
    page = 1,
    baseUrl = BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

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
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        error: {
          message: `Blague-humour.com responded with status ${response.status}`,
          status: response.status,
          url: targetUrl,
        },
      };
    }

    const html = await response.text();
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
          ? `Request to Blague-humour.com timed out after ${timeoutMs}ms`
          : "Failed to fetch Blague-humour.com category",
        url: targetUrl,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

const buildCategoryUrl = (base: string, category: string | undefined, page: number): string => {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;

  if (category) {
    // Category page: /[category]/page/[page]/
    if (page === 1) {
      return `${normalizedBase}/${category}/`;
    } else {
      return `${normalizedBase}/${category}/page/${page}/`;
    }
  } else {
    // Main page
    if (page === 1) {
      return `${normalizedBase}/`;
    } else {
      return `${normalizedBase}/page/${page}/`;
    }
  }
};

const parseJokesFromHtml = (html: string, url: string, category?: string): BlagueHumourJoke[] => {
  const $ = load(html);
  const results: BlagueHumourJoke[] = [];

  // blague-humour.com structure: each joke is in an article element
  $("article").each((index, element) => {
    const $article = $(element);

    // Extract title from h3 > a or h2 > a
    const $titleLink = $article.find("h3 a, h2 a").first();
    const title = $titleLink.text().trim();
    const jokeUrl = $titleLink.attr("href") || "";

    // Extract joke text from paragraphs (excluding title)
    let jokeText = "";

    // Get all text content after the title
    $article.find("p").each((i, p) => {
      const text = $(p).text().trim();
      if (text && !text.includes("Cliquez ici")) {
        jokeText += text + "\n";
      }
    });

    jokeText = cleanJokeHtml(jokeText.trim());

    // Extract ID from title (format: "#3784 - Title")
    const idMatch = title.match(/^#(\d+)/);
    const jokeId = idMatch ? idMatch[1] : undefined;

    // Clean title (remove ID prefix)
    const cleanTitle = title.replace(/^#\d+\s*-\s*/, "").trim();

    // Filter criteria
    if (jokeText.length < 20) return; // Skip very short texts
    if (jokeText.length > 1000) return; // Skip very long texts

    // Skip if no text or no title
    if (!jokeText || !cleanTitle) return;

    // Skip meta content
    if (
      jokeText.includes("blague-humour.com") ||
      jokeText.toLowerCase().includes("navigation") ||
      jokeText.toLowerCase().includes("publicit")
    ) {
      return;
    }

    results.push({
      text: jokeText,
      url: jokeUrl.startsWith("http") ? jokeUrl : `${BASE_URL}${jokeUrl}`,
      title: cleanTitle,
      category: category,
      id: jokeId,
    });
  });

  console.log(`[FR/BLAGUE-HUMOUR] Parsed ${results.length} jokes from ${url}`);
  return results;
};
