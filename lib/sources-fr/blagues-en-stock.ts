import { load } from "cheerio";
import { cleanJokeHtml } from "@/lib/utils/text-cleaner";

const BASE_URL = "https://www.blagues-en-stock.org";
const DEFAULT_TIMEOUT_MS = 10000;

export interface BlaguesEnStockJoke {
  text: string;
  url: string;
  category?: string;
  author?: string;
}

export interface FetchBlaguesEnStockOptions {
  /** Category filename. Example: "blagues-courtes.html" */
  category: string;
  /** Override base URL (for tests/proxy) */
  baseUrl?: string;
  /** Request timeout (ms) */
  timeoutMs?: number;
  /** Custom fetch implementation (for tests) */
  fetchImpl?: typeof fetch;
}

export interface FetchBlaguesEnStockSuccess {
  ok: true;
  jokes: BlaguesEnStockJoke[];
  meta: {
    url: string;
    category: string;
    durationMs: number;
  };
}

export interface FetchBlaguesEnStockError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchBlaguesEnStockResult = FetchBlaguesEnStockSuccess | FetchBlaguesEnStockError;

export async function fetchBlaguesEnStockCategory(
  options: FetchBlaguesEnStockOptions
): Promise<FetchBlaguesEnStockResult> {
  const {
    category,
    baseUrl = BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  if (!category || typeof category !== "string") {
    return {
      ok: false,
      error: {
        message: "Category is required to fetch Blagues-en-stock jokes",
        url: "",
      },
    };
  }

  const targetUrl = `${baseUrl}/${category}`;

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
          message: `Blagues-en-stock responded with status ${response.status}`,
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
        durationMs,
      },
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: isAbort
          ? `Request to Blagues-en-stock timed out after ${timeoutMs}ms`
          : "Failed to fetch Blagues-en-stock category",
        url: targetUrl,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

const parseJokesFromHtml = (html: string, url: string, category: string): BlaguesEnStockJoke[] => {
  const $ = load(html);
  const results: BlaguesEnStockJoke[] = [];

  // Remove scripts, styles
  $("script, style, nav, footer, header").remove();

  // Try different possible structures for jokes
  // Pattern 1: Jokes in list items with paragraphs
  $("ul li").each((index, element) => {
    const $li = $(element);
    const $p = $li.find("p").first();

    if ($p.length > 0) {
      let jokeText = $p.text().trim();
      jokeText = cleanJokeHtml(jokeText);

      // Extract proposer/author if present
      const $author = $li.find("h3, h4, .proposer, .author").first();
      const authorName = $author.length > 0 ? $author.text().trim() : undefined;

      // Filter criteria
      if (jokeText.length < 30) return; // Skip very short texts
      if (jokeText.length > 1000) return; // Skip very long texts

      // Skip navigation elements
      if (
        jokeText.toLowerCase().includes("partager") ||
        jokeText.toLowerCase().includes("facebook") ||
        jokeText.toLowerCase().includes("twitter") ||
        jokeText.toLowerCase().includes("navigation")
      ) {
        return;
      }

      results.push({
        text: jokeText,
        url: url,
        category: category.replace(".html", "").replace("blagues-", ""),
        author: authorName,
      });
    }
  });

  // Pattern 2: Jokes in article elements
  if (results.length === 0) {
    $("article, .joke, .blague").each((index, element) => {
      const $article = $(element);
      let jokeText = $article.find("p").text().trim();
      jokeText = cleanJokeHtml(jokeText);

      if (jokeText.length >= 30 && jokeText.length <= 1000) {
        results.push({
          text: jokeText,
          url: url,
          category: category.replace(".html", "").replace("blagues-", ""),
        });
      }
    });
  }

  // Pattern 3: Simple paragraphs in main content
  if (results.length === 0) {
    $("main p, .content p, #content p").each((index, element) => {
      const $p = $(element);
      let jokeText = $p.text().trim();
      jokeText = cleanJokeHtml(jokeText);

      if (jokeText.length >= 30 && jokeText.length <= 1000) {
        // Skip if contains navigation keywords
        if (
          !jokeText.toLowerCase().includes("partager") &&
          !jokeText.toLowerCase().includes("facebook") &&
          !jokeText.toLowerCase().includes("blagues-en-stock")
        ) {
          results.push({
            text: jokeText,
            url: url,
            category: category.replace(".html", "").replace("blagues-", ""),
          });
        }
      }
    });
  }

  console.log(`[FR/BLAGUES-EN-STOCK] Parsed ${results.length} jokes from ${url}`);
  return results;
};
