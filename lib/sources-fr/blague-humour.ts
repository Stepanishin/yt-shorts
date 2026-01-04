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

  // blague-humour.com structure: try multiple approaches

  // Approach 1: Look for article elements
  let $jokeElements = $("article");

  // Approach 2: If no articles, look for h2/h3 > a pattern (title links)
  if ($jokeElements.length === 0) {
    // Find all title links and treat each as a joke container
    $("h2 a, h3 a").each((i, titleLink) => {
      const $titleLink = $(titleLink);
      const jokeUrl = $titleLink.attr("href") || "";
      const title = $titleLink.text().trim();

      // Skip if not a joke URL
      if (!jokeUrl || jokeUrl.includes("/page/") || jokeUrl === "#") return;

      // Find paragraphs that follow this heading (siblings)
      let jokeText = "";
      let $current = $titleLink.closest("h2, h3").next();

      // Collect following paragraphs until we hit another heading or end
      while ($current.length > 0 && !$current.is("h2, h3")) {
        if ($current.is("p")) {
          const text = $current.text().trim();
          if (text && !text.includes("Cliquez ici") && !text.includes("J'ai ri")) {
            jokeText += text + "\n";
          }
        }
        $current = $current.next();

        // Safety: stop after 10 elements
        if ($current.prevAll().length > 10) break;
      }

      jokeText = cleanJokeHtml(jokeText.trim());

      // Extract ID from URL slug (e.g., /blague-toto/toto-maths-2/ -> use hash of URL)
      let jokeId: string | undefined;
      const slugMatch = jokeUrl.match(/\/([^\/]+)\/?$/);
      if (slugMatch) {
        // Use slug as ID, or extract numbers if present
        const slug = slugMatch[1];
        const numberMatch = slug.match(/-(\d+)$/);
        jokeId = numberMatch ? numberMatch[1] : slug;
      }

      const cleanTitle = title.replace(/^#\d+\s*-\s*/, "").trim();

      // Filter criteria
      if (jokeText.length < 20) return;
      if (jokeText.length > 1000) return;
      if (!jokeText || !cleanTitle) return;

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
  } else {
    // Original approach with article elements
    $jokeElements.each((index, element) => {
      const $article = $(element);
      const $titleLink = $article.find("h3 a, h2 a").first();
      const title = $titleLink.text().trim();
      const jokeUrl = $titleLink.attr("href") || "";

      let jokeText = "";
      $article.find("p").each((i, p) => {
        const text = $(p).text().trim();
        if (text && !text.includes("Cliquez ici") && !text.includes("J'ai ri")) {
          jokeText += text + "\n";
        }
      });

      jokeText = cleanJokeHtml(jokeText.trim());

      // Extract ID from URL slug
      let jokeId: string | undefined;
      const slugMatch = jokeUrl.match(/\/([^\/]+)\/?$/);
      if (slugMatch) {
        const slug = slugMatch[1];
        const numberMatch = slug.match(/-(\d+)$/);
        jokeId = numberMatch ? numberMatch[1] : slug;
      }

      const cleanTitle = title.replace(/^#\d+\s*-\s*/, "").trim();

      if (jokeText.length < 20) return;
      if (jokeText.length > 1000) return;
      if (!jokeText || !cleanTitle) return;

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
  }

  console.log(`[FR/BLAGUE-HUMOUR] Parsed ${results.length} jokes from ${url}`);
  return results;
};
