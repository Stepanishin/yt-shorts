import { load } from "cheerio";
import { cleanJokeHtml } from "@/lib/utils/text-cleaner";

const BASE_URL = "https://www.aberwitzig.com";
const DEFAULT_TIMEOUT_MS = 10000;

export interface AberwitzigJoke {
  text: string;
  url: string;
  category?: string;
}

export interface FetchAberwitzigOptions {
  /** Category/page. Например: "flachwitze", "schwarzer-humor", "chuck-norris-witze" */
  category: string;
  /** Page number (optional, uses Teil 1-7 system) */
  part?: number;
  /** Override base URL (for tests/proxy) */
  baseUrl?: string;
  /** Request timeout (ms) */
  timeoutMs?: number;
  /** Custom fetch implementation (for tests) */
  fetchImpl?: typeof fetch;
}

export interface FetchAberwitzigSuccess {
  ok: true;
  jokes: AberwitzigJoke[];
  meta: {
    url: string;
    category: string;
    part: number;
    durationMs: number;
  };
}

export interface FetchAberwitzigError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchAberwitzigResult = FetchAberwitzigSuccess | FetchAberwitzigError;

export async function fetchAberwitzigCategory(
  options: FetchAberwitzigOptions
): Promise<FetchAberwitzigResult> {
  const {
    category,
    part = 1,
    baseUrl = BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  if (!category || typeof category !== "string") {
    return {
      ok: false,
      error: {
        message: "Category is required to fetch Aberwitzig jokes",
        url: "",
      },
    };
  }

  const targetUrl = buildCategoryUrl(baseUrl, category, part);

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
        "Accept-Language": "de;q=0.9,en;q=0.7",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        error: {
          message: `Aberwitzig responded with status ${response.status}`,
          status: response.status,
          url: targetUrl,
        },
      };
    }

    // Site uses ISO-8859-1 encoding as specified in headers
    // Use arrayBuffer + TextDecoder to explicitly decode with correct charset
    const buffer = await response.arrayBuffer();
    const html = new TextDecoder('iso-8859-1').decode(buffer);
    const jokes = parseJokesFromHtml(html, targetUrl, category);

    return {
      ok: true,
      jokes,
      meta: {
        url: targetUrl,
        category,
        part,
        durationMs,
      },
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: isAbort
          ? `Request to Aberwitzig timed out after ${timeoutMs}ms`
          : "Failed to fetch Aberwitzig category",
        url: targetUrl,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

const buildCategoryUrl = (base: string, category: string, part: number): string => {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;

  // Aberwitzig uses format: flachwitze.php or flachwitze-11.php for parts
  let path: string;
  if (part === 1) {
    path = `${normalizedBase}/${category}.php`;
  } else {
    // Calculate page number: part 2 = page 11, part 3 = page 21, etc.
    const pageNum = (part - 1) * 10 + 1;
    path = `${normalizedBase}/${category}-${pageNum}.php`;
  }

  return path;
};

const parseJokesFromHtml = (html: string, url: string, category: string): AberwitzigJoke[] => {
  // Load HTML - Cheerio automatically decodes entities when using .text()
  const $ = load(html);
  const results: AberwitzigJoke[] = [];

  // Remove scripts, styles, nav, footer, ads
  $("script, style, nav, header, footer, .ad, .advertisement, #menu, .menu").remove();

  // Get main content
  const mainContent = $("body").html() || "";

  // Aberwitzig jokes are separated by <hr> or *** patterns, NOT numbered
  // Split by horizontal rules or *** separators
  const segments = mainContent
    .split(/<hr[^>]*>|\*\s*\*\s*\*/gi)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);

  console.log(`[DE] Found ${segments.length} segments on ${url}`);

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Load segment as HTML and extract text (Cheerio decodes entities automatically)
    const $segment = load(segment);
    let jokeText = $segment.text().trim();

    // Clean up the joke text
    jokeText = cleanJokeHtml(jokeText);

    // Filter out navigation, menus, and other non-joke content
    if (jokeText.length < 20) continue; // Skip very short texts (likely navigation)
    if (jokeText.length > 1000) continue; // Skip very long texts

    // Skip if contains typical navigation keywords
    if (
      jokeText.includes("Navigation") ||
      jokeText.includes("Menü") ||
      jokeText.includes("Impressum") ||
      jokeText.includes("Datenschutz") ||
      jokeText.includes("Cookie") ||
      jokeText.includes("Teil 1") && jokeText.length < 100
    ) {
      continue;
    }

    results.push({
      text: jokeText,
      url: `${url}#joke-${i + 1}`,
      category,
    });
  }

  console.log(`[DE] Parsed ${results.length} jokes from ${url}`);
  return results;
};
