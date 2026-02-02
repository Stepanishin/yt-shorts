import { NewsCandidate } from "../types";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_AGE_DAYS = 3;

/**
 * Decode ISO-8859-1 (Latin-1) encoded buffer to UTF-8 string
 * CM Jornal RSS feed uses ISO-8859-1, not UTF-8
 */
function decodeISO88591(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = "";

  for (let i = 0; i < bytes.length; i++) {
    // ISO-8859-1 is a single-byte encoding where each byte maps directly to a Unicode code point
    result += String.fromCharCode(bytes[i]);
  }

  return result;
}

export interface FetchCarasOptions {
  feedUrl?: string; // Single feed URL (legacy)
  feedUrls?: string[]; // Multiple feed URLs
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchCarasSuccess {
  ok: true;
  news: NewsCandidate[];
  meta: {
    url: string;
    durationMs: number;
    totalFound: number;
    filtered: number;
  };
}

export interface FetchCarasError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchCarasResult = FetchCarasSuccess | FetchCarasError;

/**
 * Fetch news from a single Caras.pt RSS feed
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

    // CM Jornal RSS uses ISO-8859-1 encoding, not UTF-8
    // We need to decode it properly to avoid character corruption
    const buffer = await response.arrayBuffer();
    const xml = decodeISO88591(buffer);
    console.log(`Feed ${feedUrl.split('/')[3] || 'unknown'}: XML length ${xml.length}`);

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
 * Fetch celebrity news from Caras.pt RSS feeds (supports multiple feeds)
 */
export async function fetchCarasNews(
  options: FetchCarasOptions = {}
): Promise<FetchCarasResult> {
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

  console.log(`Fetching ${urls.length} Caras.pt RSS feeds...`);

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
    const feedName = urls[i].split('/')[3] || `feed-${i}`;

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
 * Parse RSS XML feed (supports both RSS 2.0 and Atom)
 */
function parseRSSFeed(xml: string): NewsCandidate[] {
  const news: NewsCandidate[] = [];

  try {
    // Try RSS 2.0 format first (uses <item>)
    let itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let items = xml.match(itemRegex);

    // If no items found, try Atom format (uses <entry>)
    if (!items) {
      itemRegex = /<entry>([\s\S]*?)<\/entry>/g;
      items = xml.match(itemRegex);

      if (items) {
        console.log(`Found ${items.length} entries in Atom feed`);
        // Parse as Atom
        for (const itemXml of items) {
          try {
            const candidate = parseAtomEntry(itemXml);
            if (candidate) {
              news.push(candidate);
            }
          } catch (error) {
            console.error("Failed to parse Atom entry:", error);
          }
        }
      }
    } else {
      console.log(`Found ${items.length} items in RSS feed`);
      // Parse as RSS 2.0
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
    }

    if (!items) {
      console.log("No items or entries found in feed");
      console.log("XML sample (first 500 chars):", xml.substring(0, 500));
      return [];
    }

    console.log(`Parsed ${news.length} news items from ${items.length} feed items`);
  } catch (error) {
    console.error("Failed to parse RSS feed:", error);
  }

  return news;
}

/**
 * Parse a single Atom <entry> element
 */
function parseAtomEntry(entryXml: string): NewsCandidate | null {
  try {
    // Extract fields from Atom format
    const title = extractTag(entryXml, "title");
    const linkMatch = entryXml.match(/<link[^>]+href=["']([^"']+)["']/i);
    const link = linkMatch ? linkMatch[1] : "";
    const summary = extractTag(entryXml, "summary") || extractTag(entryXml, "content");
    const published = extractTag(entryXml, "published") || extractTag(entryXml, "updated");
    const id = extractTag(entryXml, "id");

    // Try to extract image
    let imageUrl = extractMediaImage(entryXml);
    if (!imageUrl) {
      imageUrl = extractImageFromContent(summary);
    }

    // Must have title, link
    if (!title || !link) {
      return null;
    }

    // Use placeholder if no image found
    if (!imageUrl) {
      imageUrl = "https://via.placeholder.com/1200x800/e0e0e0/666666?text=Caras";
    }

    // Parse published date
    let publishedDate = new Date();
    if (published) {
      try {
        publishedDate = new Date(published);
      } catch {
        publishedDate = new Date();
      }
    }

    // Extract slug from URL
    const slug = link.split("/").filter(Boolean).pop() || "";

    const candidate: NewsCandidate = {
      source: "caras",
      title: cleanText(title),
      summary: cleanText(summary) || cleanText(title),
      imageUrl: imageUrl,
      url: link,
      externalId: id || link,
      slug: slug,
      category: "Famosos",
      publishedDate: publishedDate,
      language: "pt",
      meta: {
        feedFormat: "atom",
      },
    };

    return candidate;
  } catch (error) {
    console.error("Failed to parse Atom entry:", error);
    return null;
  }
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

    // Extract full content
    const contentEncoded = extractCDATA(itemXml, "content:encoded");

    // Extract full text from content:encoded or description
    let fullText = extractTextFromHTML(contentEncoded || description);

    // Extract image - try multiple sources in order of preference
    let imageUrl = extractMediaImage(itemXml);

    // Try enclosure tag (CM Jornal uses this)
    if (!imageUrl) {
      imageUrl = extractEnclosureImage(itemXml);
      // Transform CM Jornal thumbnails to full-size images
      if (imageUrl && imageUrl.includes("cmjornal.pt")) {
        imageUrl = transformCMJornalImageUrl(imageUrl);
      }
    }

    // If media:content is a video or doesn't exist, try first img in content
    if (!imageUrl || imageUrl.includes(".mp4") || imageUrl.includes(".webm")) {
      imageUrl = extractImageFromContent(contentEncoded || description) || imageUrl;
    }

    // Fallback: if still no valid image, try content images again
    if (!imageUrl || imageUrl.includes(".mp4") || imageUrl.includes(".webm")) {
      const allImages = extractAllImagesFromContent(contentEncoded || description);
      // Find first non-video image
      imageUrl = allImages.find(img => !img.includes(".mp4") && !img.includes(".webm")) || null;
    }

    // Must have title and link
    if (!title || !link) {
      return null;
    }

    // Use placeholder if no image found
    if (!imageUrl) {
      imageUrl = "https://via.placeholder.com/1200x800/e0e0e0/666666?text=Caras";
    }

    // If no text content, use title as summary
    if (!fullText || fullText.length < 50) {
      fullText = title;
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
      link.includes("/gente/") ||
      title.toLowerCase().includes("famoso") ||
      title.toLowerCase().includes("celebrit");

    const candidate: NewsCandidate = {
      source: "caras",
      title: cleanText(title),
      summary: cleanText(description) || cleanText(title),
      imageUrl: imageUrl,
      url: link,
      externalId: guid || link,
      slug: slug,
      category: isCelebrityNews ? "Famosos" : "General",
      publishedDate: publishedDate,
      language: "pt",
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
 * Extract image URL from enclosure tag
 */
function extractEnclosureImage(xml: string): string | null {
  const enclosureMatch = xml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i);
  if (enclosureMatch) {
    return enclosureMatch[1];
  }

  // Try without type check
  const enclosureMatch2 = xml.match(/<enclosure[^>]+url=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i);
  if (enclosureMatch2) {
    return enclosureMatch2[1];
  }

  // Generic enclosure check (for feeds that might not specify extension)
  const enclosureMatch3 = xml.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
  if (enclosureMatch3) {
    return enclosureMatch3[1];
  }

  return null;
}

/**
 * Transform CM Jornal thumbnail URLs to larger images
 * CM Jornal only serves real images at specific sizes: 100x100, 500x500, 800x800
 * Sizes like 200x200, 300x300, 600x600, 1200x675 return 1x1 placeholders
 * Transform to: img_800x800uu (largest available size)
 */
function transformCMJornalImageUrl(url: string): string {
  if (!url.includes("cmjornal.pt")) {
    return url;
  }

  // Replace thumbnail size with largest available size (800x800)
  // img_100x100uu -> img_800x800uu (tested: returns real image, not placeholder)
  if (url.includes("img_100x100uu")) {
    return url.replace(/img_100x100uu/g, "img_800x800uu");
  }

  // Also upgrade other small sizes to 800x800
  if (url.match(/img_\d+x\d+uu/)) {
    return url.replace(/img_\d+x\d+uu/g, "img_800x800uu");
  }

  return url;
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

    // Only accept celebrity news - filter out general news
    const url = item.url.toLowerCase();
    const title = item.title.toLowerCase();
    const summary = (item.summary || "").toLowerCase();

    // Check for celebrity-specific indicators in URL, title, or summary
    const isCelebrityNews =
      item.meta?.isCelebrityNews === true ||
      // URL patterns
      url.includes("/famosos/") ||
      url.includes("/gente/") ||
      url.includes("/celebrit") ||
      url.includes("/vidas/") ||  // CM Jornal uses /vidas/ for celebrity news
      url.includes("/tv-media/") ||  // TV and media personalities
      // Keywords in title or summary
      title.includes("famoso") ||
      title.includes("celebridade") ||
      title.includes("ator") ||
      title.includes("atriz") ||
      title.includes("cantor") ||
      title.includes("cantora") ||
      summary.includes("famoso") ||
      summary.includes("celebridade");

    if (!isCelebrityNews) {
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

  // First decode HTML entities (CM Jornal encodes CDATA tags as &lt;![CDATA[ ... ]]&gt;)
  let cleaned = decodeHTMLEntities(text);

  // Remove CDATA wrapper if present (after decoding HTML entities)
  cleaned = cleaned.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1");
  cleaned = cleaned.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, "");

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

  // First decode named entities
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, "g"), char);
  }

  // Decode numeric entities in hexadecimal format: &#xHHHH;
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  // Decode numeric entities in decimal format: &#DDDD;
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });

  return decoded;
}
