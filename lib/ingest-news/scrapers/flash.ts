import { NewsCandidate } from "../types";

const BASE_URL = "https://www.flash.pt";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_AGE_DAYS = 3;

export interface FetchFlashOptions {
  feedUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchFlashSuccess {
  ok: true;
  news: NewsCandidate[];
  meta: {
    url: string;
    durationMs: number;
    totalFound: number;
    filtered: number;
  };
}

export interface FetchFlashError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchFlashResult = FetchFlashSuccess | FetchFlashError;

/**
 * Fetch celebrity news from Flash.pt RSS feed
 */
export async function fetchFlashNews(
  options: FetchFlashOptions = {}
): Promise<FetchFlashResult> {
  const {
    feedUrl = `${BASE_URL}/feed`,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    console.log(`Fetching Flash.pt RSS feed from ${feedUrl}...`);

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

    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        error: {
          message: `Flash.pt RSS feed responded with status ${response.status}`,
          status: response.status,
          url: feedUrl,
        },
      };
    }

    const xml = await response.text();
    console.log(`Flash.pt feed: XML length ${xml.length}`);

    const allNews = parseRSSFeed(xml);
    const filteredNews = filterNews(allNews, MAX_AGE_DAYS);

    return {
      ok: true,
      news: filteredNews,
      meta: {
        url: feedUrl,
        durationMs,
        totalFound: allNews.length,
        filtered: filteredNews.length,
      },
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: isAbort
          ? `Request to Flash.pt timed out after ${timeoutMs}ms`
          : "Failed to fetch Flash.pt news",
        url: feedUrl,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
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
    const creator = extractCDATA(itemXml, "dc:creator") || extractTag(itemXml, "dc:creator");

    // Extract categories
    const categoryMatches = itemXml.match(/<category><!\[CDATA\[([^\]]+)\]\]><\/category>/g);
    const categories: string[] = [];
    if (categoryMatches) {
      categoryMatches.forEach(match => {
        const catMatch = match.match(/<!\[CDATA\[([^\]]+)\]\]/);
        if (catMatch) {
          categories.push(catMatch[1]);
        }
      });
    }

    // Extract full content
    const contentEncoded = extractCDATA(itemXml, "content:encoded");

    // Extract full text from content:encoded or description
    const fullText = extractTextFromHTML(contentEncoded || description);

    // Extract image - try media:content first
    let imageUrl = extractMediaImage(itemXml);

    // If media:content doesn't exist, try first img in content
    if (!imageUrl) {
      imageUrl = extractImageFromContent(contentEncoded || description) || imageUrl;
    }

    // Fallback: if still no valid image, try all content images
    if (!imageUrl || imageUrl.includes(".mp4") || imageUrl.includes(".webm")) {
      const allImages = extractAllImagesFromContent(contentEncoded || description);
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

    // Determine category
    const mainCategory = categories.length > 0 ? categories[0] : "Geral";

    const candidate: NewsCandidate = {
      source: "flash",
      title: cleanText(title),
      summary: cleanText(description) || cleanText(title),
      imageUrl: imageUrl,
      url: link,
      externalId: guid || link,
      slug: slug,
      category: mainCategory,
      publishedDate: publishedDate,
      author: creator,
      language: "pt",
      meta: {
        categories,
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
 * Extract all image URLs from content HTML
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

    // Accept all news from Flash.pt as it's a celebrity-focused publication
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
