import { load } from "cheerio";
import { cleanJokeHtml } from "@/lib/utils/text-cleaner";

const BASE_URL = "https://blague-drole.net";
const DEFAULT_TIMEOUT_MS = 10000;

export interface BlagueDroleJoke {
  text: string;
  url: string;
  category?: string;
  title?: string;
  author?: string;
  id?: string;
}

export interface FetchBlagueDroleOptions {
  /** Category slug. Example: "blague-courte" for short jokes */
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

export interface FetchBlagueDroleSuccess {
  ok: true;
  jokes: BlagueDroleJoke[];
  meta: {
    url: string;
    category?: string;
    page: number;
    durationMs: number;
  };
}

export interface FetchBlagueDroleError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchBlagueDroleResult = FetchBlagueDroleSuccess | FetchBlagueDroleError;

export async function fetchBlagueDroleCategory(
  options: FetchBlagueDroleOptions
): Promise<FetchBlagueDroleResult> {
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
          message: `Blague-drole.net responded with status ${response.status}`,
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
          ? `Request to Blague-drole.net timed out after ${timeoutMs}ms`
          : "Failed to fetch Blague-drole.net category",
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
    // Category page: /blague/[category]/[page]
    if (page === 1) {
      return `${normalizedBase}/blague/${category}`;
    } else {
      return `${normalizedBase}/blague/${category}/${page}`;
    }
  } else {
    // Main page: /blague/[page]
    if (page === 1) {
      return `${normalizedBase}/blague`;
    } else {
      return `${normalizedBase}/blague/${page}`;
    }
  }
};

const parseJokesFromHtml = (html: string, url: string, category?: string): BlagueDroleJoke[] => {
  const $ = load(html);
  const results: BlagueDroleJoke[] = [];

  // Blague-drole.net uses JSON-LD structured data
  $('script[type="application/ld+json"]').each((index, element) => {
    try {
      const jsonText = $(element).html();
      if (!jsonText) return;

      const data = JSON.parse(jsonText);

      // Check if it's an ItemList with jokes
      if (data["@type"] === "ItemList" && Array.isArray(data.itemListElement)) {
        for (const item of data.itemListElement) {
          if (item["@type"] === "Article" && item.genre === "blague") {
            const jokeText = cleanJokeHtml(item.articleBody || "");
            const headline = item.headline || "";
            const jokeUrl = item.url || "";

            // Extract ID from URL if possible
            const idMatch = jokeUrl.match(/blague-(\d+)/);
            const jokeId = idMatch ? idMatch[1] : undefined;

            // Extract author name
            const authorName = item.author?.name || undefined;

            // Filter criteria
            if (jokeText.length < 20) continue; // Skip very short texts
            if (jokeText.length > 1000) continue; // Skip very long texts

            // Skip if contains meta keywords
            if (
              jokeText.includes("blague-drole.net") ||
              jokeText.toLowerCase().includes("navigation") ||
              jokeText.toLowerCase().includes("publicit")
            ) {
              continue;
            }

            results.push({
              text: jokeText,
              url: jokeUrl.startsWith("http") ? jokeUrl : `${BASE_URL}${jokeUrl}`,
              title: headline,
              author: authorName,
              category: category,
              id: jokeId,
            });
          }
        }
      }
    } catch (error) {
      console.error(`[FR/BLAGUE-DROLE] Error parsing JSON-LD:`, error);
    }
  });

  // Fallback: parse from HTML if JSON-LD didn't work
  if (results.length === 0) {
    console.log(`[FR/BLAGUE-DROLE] JSON-LD parsing failed, trying HTML fallback for ${url}`);

    // Try to find joke elements in HTML structure
    $(".blague-item, article.blague, .joke-content").each((index, element) => {
      const $element = $(element);
      const jokeText = cleanJokeHtml($element.find("p, .text, .content").text());

      if (jokeText.length >= 20 && jokeText.length <= 1000) {
        results.push({
          text: jokeText,
          url: url,
          category: category,
          id: `fallback-${index}`,
        });
      }
    });
  }

  console.log(`[FR/BLAGUE-DROLE] Parsed ${results.length} jokes from ${url}`);
  return results;
};
