import { load } from "cheerio";
import { cleanJokeHtml } from "@/lib/utils/text-cleaner";

const BASE_URL = "https://www.programmwechsel.de";
const DEFAULT_TIMEOUT_MS = 10000;

export interface ProgrammwechselJoke {
  text: string;
  url: string;
  category?: string;
}

export interface FetchProgrammwechselOptions {
  /** Page path. Example: "/lustig/humor/gute-witze.html" */
  pagePath: string;
  /** Override base URL (for tests/proxy) */
  baseUrl?: string;
  /** Request timeout (ms) */
  timeoutMs?: number;
  /** Custom fetch implementation (for tests) */
  fetchImpl?: typeof fetch;
}

export interface FetchProgrammwechselSuccess {
  ok: true;
  jokes: ProgrammwechselJoke[];
  meta: {
    url: string;
    pagePath: string;
    durationMs: number;
  };
}

export interface FetchProgrammwechselError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchProgrammwechselResult = FetchProgrammwechselSuccess | FetchProgrammwechselError;

export async function fetchProgrammwechselPage(
  options: FetchProgrammwechselOptions
): Promise<FetchProgrammwechselResult> {
  const {
    pagePath,
    baseUrl = BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  if (!pagePath || typeof pagePath !== "string") {
    return {
      ok: false,
      error: {
        message: "Page path is required to fetch Programmwechsel jokes",
        url: "",
      },
    };
  }

  const targetUrl = buildPageUrl(baseUrl, pagePath);

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
          message: `Programmwechsel responded with status ${response.status}`,
          status: response.status,
          url: targetUrl,
        },
      };
    }

    const html = await response.text();
    const jokes = parseJokesFromHtml(html, targetUrl);

    return {
      ok: true,
      jokes,
      meta: {
        url: targetUrl,
        pagePath,
        durationMs,
      },
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: isAbort
          ? `Request to Programmwechsel timed out after ${timeoutMs}ms`
          : "Failed to fetch Programmwechsel page",
        url: targetUrl,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

const buildPageUrl = (base: string, pagePath: string): string => {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  return `${normalizedBase}${normalizedPath}`;
};

const parseJokesFromHtml = (html: string, url: string): ProgrammwechselJoke[] => {
  const $ = load(html);
  const results: ProgrammwechselJoke[] = [];

  // Remove scripts, styles, nav, header, footer, ads, sidebar
  $("script, style, nav, header, footer, .ad, .advertisement, #menu, .menu, .sidebar, aside").remove();

  // Find the main content area
  const mainArea = $("main, article, .content, #content").first();
  const $content = mainArea.length > 0 ? mainArea : $("body");

  // Find all h3 headers which mark joke titles
  const $headers = $content.find("h3, h4");

  console.log(`[DE/Programmwechsel] Found ${$headers.length} potential jokes on ${url}`);

  $headers.each((index, element) => {
    const $header = $(element);
    const jokeTitle = $header.text().trim();

    // Skip headers that are likely navigation or metadata
    if (
      jokeTitle.toLowerCase().includes("navigation") ||
      jokeTitle.toLowerCase().includes("menü") ||
      jokeTitle.toLowerCase().includes("inhalt") ||
      jokeTitle.toLowerCase().includes("kategorie") ||
      jokeTitle.length === 0
    ) {
      return; // continue
    }

    // Collect all sibling text content until next header or hr
    let jokeText = "";
    let $next = $header.next();

    while ($next.length > 0) {
      const tagName = $next.prop("tagName")?.toLowerCase();

      // Stop at next header or horizontal rule
      if (tagName === "h2" || tagName === "h3" || tagName === "h4" || tagName === "hr") {
        break;
      }

      // Collect text from paragraph or div
      if (tagName === "p" || tagName === "div" || !tagName) {
        const text = $next.text().trim();
        if (text) {
          jokeText += (jokeText ? "\n\n" : "") + text;
        }
      }

      $next = $next.next();
    }

    // Clean up the joke text
    jokeText = cleanJokeHtml(jokeText);

    // Filter criteria for quality jokes
    // Accept 20-700 characters (longer jokes are the goal)
    if (jokeText.length < 20) return; // Skip very short texts
    if (jokeText.length > 700) return; // Skip very long texts

    // Skip if contains typical navigation or meta keywords
    const lowerText = jokeText.toLowerCase();
    if (
      jokeText.includes("Impressum") ||
      jokeText.includes("Datenschutz") ||
      jokeText.includes("Cookie") ||
      lowerText.includes("programmwechsel.de") ||
      jokeText.includes("Copyright") ||
      jokeText.includes("©") ||
      lowerText.includes("adventskalender") && jokeText.length < 200 ||
      lowerText.includes("seiten erwarten") ||
      lowerText.includes("fein säuberlich") ||
      lowerText.includes("nach kategorien sortiert") ||
      lowerText.includes("ob es gute oder") ||
      (lowerText.includes("1000 witze") && lowerText.includes("kategorien"))
    ) {
      return; // continue
    }

    // Extract category from URL
    let category = "allgemein";
    const categoryMatch = url.match(/\/([^\/]+)\.html/);
    if (categoryMatch) {
      category = categoryMatch[1];
    }

    results.push({
      text: jokeText,
      url: `${url}#${encodeURIComponent(jokeTitle)}`,
      category,
    });
  });

  console.log(`[DE/Programmwechsel] Parsed ${results.length} jokes from ${url}`);
  return results;
};
