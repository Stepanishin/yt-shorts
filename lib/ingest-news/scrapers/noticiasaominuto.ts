import { NewsCandidate } from "../types";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_AGE_DAYS = 3;

export interface FetchNoticiasAoMinutoOptions {
  feedUrl?: string;
  feedUrls?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchNoticiasAoMinutoSuccess {
  ok: true;
  news: NewsCandidate[];
  meta: {
    url: string;
    durationMs: number;
    totalFound: number;
    filtered: number;
  };
}

export interface FetchNoticiasAoMinutoError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchNoticiasAoMinutoResult = FetchNoticiasAoMinutoSuccess | FetchNoticiasAoMinutoError;

/**
 * Fetch news from a single Notícias ao Minuto RSS feed
 */
async function fetchSingleFeed(
  feedUrl: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{ news: NewsCandidate[]; totalFound: number } | { error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(feedUrl, {
      method: "GET",
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return { error: `RSS feed responded with status ${response.status}` };
    }

    const xml = await response.text();
    console.log(`Feed ${feedUrl.split('/').pop() || 'unknown'}: XML length ${xml.length}`);

    const allNews = parseRSSFeed(xml);
    return { news: allNews, totalFound: allNews.length };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      error: isAbort
        ? `Request timed out after ${timeoutMs}ms`
        : "Failed to fetch feed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch news from Notícias ao Minuto RSS feeds
 */
export async function fetchNoticiasAoMinutoNews(
  options: FetchNoticiasAoMinutoOptions = {}
): Promise<FetchNoticiasAoMinutoResult> {
  const {
    feedUrl,
    feedUrls,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  // Support both single feedUrl and multiple feedUrls
  const urls = feedUrls || (feedUrl ? [feedUrl] : []);

  if (urls.length === 0) {
    return {
      ok: false,
      error: {
        message: "No feed URLs provided",
        url: "",
      },
    };
  }

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  console.log(`Fetching ${urls.length} Notícias ao Minuto RSS feeds...`);

  // Fetch all feeds in parallel
  const results = await Promise.all(
    urls.map(url => fetchSingleFeed(url, timeoutMs, fetchImpl))
  );

  const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

  // Combine results
  const allNews: NewsCandidate[] = [];
  let totalFound = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const feedName = urls[i].split('/').pop() || `feed-${i}`;

    if ('error' in result) {
      console.warn(`Feed ${feedName} failed: ${result.error}`);
      errors.push(`${feedName}: ${result.error}`);
    } else {
      console.log(`Feed ${feedName}: found ${result.news.length} items`);
      allNews.push(...result.news);
      totalFound += result.totalFound;
    }
  }

  // Deduplicate by externalId or URL
  const seen = new Set<string>();
  const uniqueNews = allNews.filter(item => {
    const key = item.externalId || item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Total unique news: ${uniqueNews.length} (${allNews.length} before dedup)`);

  // Filter by age and criteria
  const filteredNews = filterNews(uniqueNews, MAX_AGE_DAYS);

  // If all feeds failed, return error
  if (errors.length === urls.length) {
    return {
      ok: false,
      error: {
        message: `All feeds failed: ${errors.join('; ')}`,
        url: urls.join(', '),
      },
    };
  }

  return {
    ok: true,
    news: filteredNews,
    meta: {
      url: urls.join(', '),
      durationMs,
      totalFound,
      filtered: filteredNews.length,
    },
  };
}

/**
 * Parse RSS XML feed
 */
function parseRSSFeed(xml: string): NewsCandidate[] {
  const news: NewsCandidate[] = [];

  try {
    // Extract all <item> elements using regex
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items = xml.match(itemRegex);

    if (!items) {
      console.log("No items found in RSS feed");
      return [];
    }

    console.log(`Found ${items.length} items in RSS feed`);

    for (const itemXml of items) {
      try {
        const candidate = parseRSSItem(itemXml);
        if (candidate) {
          news.push(candidate);
        }
      } catch (error) {
        console.error("Failed to parse RSS item:", error);
      }
    }

    console.log(`Parsed ${news.length} news items from ${items.length} RSS items`);
  } catch (error) {
    console.error("Failed to parse RSS feed:", error);
  }

  return news;
}

/**
 * Parse a single RSS <item> element
 */
function parseRSSItem(itemXml: string): NewsCandidate | null {
  try {
    // Extract fields using regex
    const title = extractCDATA(itemXml, "title") || extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const description = extractCDATA(itemXml, "description") || extractTag(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate");
    const guid = extractTag(itemXml, "guid");

    // Extract image from enclosure tag or content
    let imageUrl = extractEnclosureImage(itemXml);

    // If no enclosure, try to extract from description
    if (!imageUrl) {
      imageUrl = extractImageFromContent(description);
    }

    // Must have title and link
    if (!title || !link) {
      return null;
    }

    // Must have image
    if (!imageUrl) {
      return null;
    }

    // Must have some description
    if (!description || description.length < 20) {
      return null;
    }

    // Parse published date
    let publishedDate = new Date();
    if (pubDate) {
      try {
        publishedDate = new Date(pubDate);
      } catch {
        publishedDate = new Date();
      }
    }

    // Extract slug from URL
    const slug = link.split("/").filter(Boolean).pop() || "";

    // Check if this is celebrity/lifestyle news
    const isCelebrityNews =
      link.includes("/lifestyle/") ||
      link.includes("/fama/") ||
      link.includes("/celebridades/") ||
      title.toLowerCase().includes("celebr") ||
      title.toLowerCase().includes("famoso");

    const candidate: NewsCandidate = {
      source: "noticiasaominuto",
      title: cleanText(title),
      summary: cleanText(description),
      imageUrl: imageUrl,
      url: link,
      externalId: guid || link,
      slug: slug,
      category: isCelebrityNews ? "Famosos" : "Lifestyle",
      publishedDate: publishedDate,
      language: "pt",
      meta: {
        isCelebrityNews,
      },
    };

    return candidate;
  } catch (error) {
    console.error("Failed to parse RSS item:", error);
    return null;
  }
}

/**
 * Extract content from CDATA tag
 */
function extractCDATA(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Extract content from regular tag
 */
function extractTag(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\\/${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Extract image URL from enclosure tag
 */
function extractEnclosureImage(xml: string): string | null {
  const enclosureMatch = xml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i);
  if (enclosureMatch) {
    return enclosureMatch[1];
  }

  // Try without type check
  const enclosureMatch2 = xml.match(/<enclosure[^>]+url=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
  if (enclosureMatch2) {
    return enclosureMatch2[1];
  }

  return null;
}

/**
 * Extract image URL from content HTML
 */
function extractImageFromContent(html: string): string | null {
  if (!html) return null;

  // Look for img src in the content
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }

  return null;
}

/**
 * Filter news by criteria
 */
function filterNews(news: NewsCandidate[], maxAgeDays: number): NewsCandidate[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  return news.filter((item) => {
    // Must have title
    if (!item.title || item.title.length < 10) {
      return false;
    }

    // Must have summary
    if (!item.summary || item.summary.length < 20) {
      return false;
    }

    // Must have image
    if (!item.imageUrl) {
      return false;
    }

    // Must have URL
    if (!item.url) {
      return false;
    }

    // Check age
    if (item.publishedDate && item.publishedDate < cutoffDate) {
      return false;
    }

    // Accept lifestyle and celebrity news
    const url = item.url.toLowerCase();
    const isRelevantCategory =
      item.meta?.isCelebrityNews === true ||
      url.includes("/lifestyle/") ||
      url.includes("/fama/") ||
      url.includes("/celebridades/");

    if (!isRelevantCategory) {
      return false;
    }

    return true;
  });
}

/**
 * Clean text by removing HTML tags and extra whitespace
 */
function cleanText(text: string): string {
  if (!text) return "";

  // Remove HTML tags
  let cleaned = text.replace(/<[^>]*>/g, "");

  // Decode HTML entities
  cleaned = decodeHTMLEntities(cleaned);

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * Decode common HTML entities
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, "g"), char);
  }

  return decoded;
}
