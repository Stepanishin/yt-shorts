import { NewsCandidate } from "../types";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_AGE_DAYS = 3;

export interface FetchGoogleNewsPTOptions {
  feedUrls?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchGoogleNewsPTSuccess {
  ok: true;
  news: NewsCandidate[];
  meta: {
    url: string;
    durationMs: number;
    totalFound: number;
    filtered: number;
  };
}

export interface FetchGoogleNewsPTError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchGoogleNewsPTResult = FetchGoogleNewsPTSuccess | FetchGoogleNewsPTError;

/**
 * Fetch news from a single Google News RSS feed
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
    console.log(`Google News PT feed: XML length ${xml.length}`);

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
 * Fetch celebrity news from Google News Portugal RSS feeds
 */
export async function fetchGoogleNewsPT(
  options: FetchGoogleNewsPTOptions = {}
): Promise<FetchGoogleNewsPTResult> {
  const {
    feedUrls = [],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  if (feedUrls.length === 0) {
    return {
      ok: false,
      error: {
        message: "No feed URLs provided",
        url: "",
      },
    };
  }

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  console.log(`Fetching ${feedUrls.length} Google News PT RSS feeds...`);

  // Fetch all feeds in parallel
  const results = await Promise.all(
    feedUrls.map(url => fetchSingleFeed(url, timeoutMs, fetchImpl))
  );

  const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

  // Combine results
  const allNews: NewsCandidate[] = [];
  let totalFound = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const feedName = `feed-${i + 1}`;

    if ('error' in result) {
      console.warn(`${feedName} failed: ${result.error}`);
      errors.push(`${feedName}: ${result.error}`);
    } else {
      console.log(`${feedName}: found ${result.news.length} items`);
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
  if (errors.length === feedUrls.length) {
    return {
      ok: false,
      error: {
        message: `All feeds failed: ${errors.join('; ')}`,
        url: feedUrls.join(', '),
      },
    };
  }

  return {
    ok: true,
    news: filteredNews,
    meta: {
      url: feedUrls.join(', '),
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
    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const pubDate = extractTag(itemXml, "pubDate");
    const guid = extractTag(itemXml, "guid");
    const source = extractTag(itemXml, "source");

    // Try to extract description/snippet
    const description = extractCDATA(itemXml, "description") || extractTag(itemXml, "description") || title;

    // Must have title and link
    if (!title || !link) {
      return null;
    }

    // Try to extract image from various sources
    let imageUrl = extractEnclosureImage(itemXml);

    // Try media:content tag
    if (!imageUrl) {
      imageUrl = extractMediaImage(itemXml);
    }

    // Try to extract from description HTML
    if (!imageUrl && description) {
      imageUrl = extractImageFromContent(description);
    }

    // If still no image, use a neutral placeholder
    // (Google News RSS doesn't always include images)
    if (!imageUrl) {
      imageUrl = "https://via.placeholder.com/1200x800/e0e0e0/666666?text=Sem+Imagem";
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

    // Google News links are usually redirects, try to decode them
    const actualUrl = decodeGoogleNewsUrl(link);

    // Extract slug from URL
    const slug = actualUrl.split("/").filter(Boolean).pop() || "";

    // Try to extract source domain
    const sourceDomain = extractDomain(actualUrl);

    const candidate: NewsCandidate = {
      source: "googlenews",
      title: cleanText(title),
      summary: cleanText(description),
      imageUrl: imageUrl,
      url: actualUrl,
      externalId: guid || actualUrl,
      slug: slug,
      category: "Notícias",
      publishedDate: publishedDate,
      language: "pt",
      meta: {
        originalSource: source || sourceDomain,
        googleNewsUrl: link,
      },
    };

    return candidate;
  } catch (error) {
    console.error("Failed to parse RSS item:", error);
    return null;
  }
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
 * Extract content from CDATA tag
 */
function extractCDATA(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, "i");
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
 * Extract image from media:content tag
 */
function extractMediaImage(xml: string): string | null {
  const mediaMatch = xml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (mediaMatch) {
    return mediaMatch[1];
  }

  return null;
}

/**
 * Extract image URL from HTML content
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
 * Decode Google News URL to get actual article URL
 */
function decodeGoogleNewsUrl(url: string): string {
  try {
    // Google News URLs often contain the actual URL as a parameter
    const urlObj = new URL(url);

    // Check if it's a Google News redirect
    if (url.includes('news.google.com')) {
      // Try to extract the actual URL from the redirect
      const articleParam = urlObj.searchParams.get('url');
      if (articleParam) {
        return decodeURIComponent(articleParam);
      }
    }

    return url;
  } catch {
    return url;
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return "";
  }
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

    // Must have URL
    if (!item.url) {
      return false;
    }

    // Check age
    if (item.publishedDate && item.publishedDate < cutoffDate) {
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
