import { NewsCandidate } from "../types";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_AGE_DAYS = 3;

export interface FetchHolaOptions {
  feedUrl?: string; // Single feed URL (legacy)
  feedUrls?: string[]; // Multiple feed URLs
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchHolaSuccess {
  ok: true;
  news: NewsCandidate[];
  meta: {
    url: string;
    durationMs: number;
    totalFound: number;
    filtered: number;
  };
}

export interface FetchHolaError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchHolaResult = FetchHolaSuccess | FetchHolaError;

/**
 * Fetch news from a single Hola.com RSS feed
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
    console.log(`Feed ${feedUrl.split('/')[6] || 'unknown'}: XML length ${xml.length}`);

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
 * Fetch celebrity news from Hola.com RSS feeds (supports multiple feeds)
 */
export async function fetchHolaNews(
  options: FetchHolaOptions = {}
): Promise<FetchHolaResult> {
  const {
    feedUrl,
    feedUrls,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  // Support both single feedUrl (legacy) and multiple feedUrls
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

  console.log(`Fetching ${urls.length} Hola.com RSS feeds...`);

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
    const feedName = urls[i].split('/')[6] || `feed-${i}`;

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
    const title = extractCDATA(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const description = extractCDATA(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate");
    const guid = extractTag(itemXml, "guid");

    // Extract full content
    const contentEncoded = extractCDATA(itemXml, "content:encoded");

    // Extract full text from content:encoded
    const fullText = extractTextFromHTML(contentEncoded);

    // Extract image - try media:content first (but check if it's an image, not video)
    let imageUrl = extractMediaImage(itemXml);

    // If media:content is a video or doesn't exist, try first img in content
    if (!imageUrl || imageUrl.includes(".mp4") || imageUrl.includes(".webm")) {
      imageUrl = extractImageFromContent(contentEncoded) || imageUrl;
    }

    // Fallback: if still no valid image, try content images again
    if (!imageUrl || imageUrl.includes(".mp4") || imageUrl.includes(".webm")) {
      const allImages = extractAllImagesFromContent(contentEncoded);
      // Find first non-video image
      imageUrl = allImages.find(img => !img.includes(".mp4") && !img.includes(".webm")) || null;
    }

    // Must have title, link, and image
    if (!title || !link || !imageUrl) {
      return null;
    }

    // Must have some text content
    if (!fullText || fullText.length < 100) {
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

    // Determine if this is celebrity/famosos news
    const isCelebrityNews =
      link.includes("/famosos/") ||
      link.includes("/celebrit") ||
      link.includes("/realeza/") ||
      title.toLowerCase().includes("famoso") ||
      title.toLowerCase().includes("celebrit");

    const candidate: NewsCandidate = {
      source: "hola",
      title: cleanText(title),
      summary: cleanText(description) || cleanText(title),
      imageUrl: imageUrl,
      url: link,
      externalId: guid || link,
      slug: slug,
      category: isCelebrityNews ? "Famosos" : "General",
      publishedDate: publishedDate,
      language: "es",
      meta: {
        isCelebrityNews,
        fullText: fullText, // Store full text in meta
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
 * Extract image URL from content:encoded HTML
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
 * Extract all image URLs from content:encoded HTML
 */
function extractAllImagesFromContent(html: string): string[] {
  if (!html) return [];

  const images: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    images.push(match[1]);
  }

  return images;
}

/**
 * Extract plain text from HTML content
 */
function extractTextFromHTML(html: string): string {
  if (!html) return "";

  // Remove script and style tags completely
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove all HTML tags
  text = text.replace(/<[^>]*>/g, " ");

  // Decode HTML entities
  text = decodeHTMLEntities(text);

  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
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

    // Accept celebrity news OR actualidad/realeza categories
    // Now we fetch from multiple feeds, so we accept all relevant content
    const url = item.url.toLowerCase();
    const isRelevantCategory =
      item.meta?.isCelebrityNews === true ||
      url.includes("/famosos/") ||
      url.includes("/actualidad/") ||
      url.includes("/realeza/") ||
      url.includes("/casas-reales/");

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
