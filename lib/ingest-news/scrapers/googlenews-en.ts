import { NewsCandidate } from "../types";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_AGE_DAYS = 3;

export interface FetchGoogleNewsENOptions {
  feedUrls?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchGoogleNewsENSuccess {
  ok: true;
  news: NewsCandidate[];
  meta: {
    url: string;
    durationMs: number;
    totalFound: number;
    filtered: number;
  };
}

export interface FetchGoogleNewsENError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchGoogleNewsENResult = FetchGoogleNewsENSuccess | FetchGoogleNewsENError;

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
    console.log(`Google News EN feed: XML length ${xml.length}`);

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
 * Fetch celebrity news from Google News US English RSS feeds
 */
export async function fetchGoogleNewsEN(
  options: FetchGoogleNewsENOptions = {}
): Promise<FetchGoogleNewsENResult> {
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

  console.log(`Fetching ${feedUrls.length} Google News EN RSS feeds...`);

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

  // Fetch OG images for articles that don't have images
  await enrichWithOGImages(filteredNews, fetchImpl);

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
    const rawTitle = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const pubDate = extractTag(itemXml, "pubDate");
    const guid = extractTag(itemXml, "guid");
    const source = extractTag(itemXml, "source");

    const descriptionHtml = extractCDATA(itemXml, "description") || extractTag(itemXml, "description") || "";

    if (!rawTitle || !link) {
      return null;
    }

    // Strip " - Source Name" suffix from title
    const title = stripSourceFromTitle(rawTitle);

    // Google News description is an <ol> of related articles — extract clean text
    const summary = extractSummaryFromGoogleNewsHtml(descriptionHtml, title);

    let imageUrl = extractEnclosureImage(itemXml);

    if (!imageUrl) {
      imageUrl = extractMediaImage(itemXml);
    }

    if (!imageUrl && descriptionHtml) {
      imageUrl = extractImageFromContent(descriptionHtml);
    }

    let publishedDate = new Date();
    if (pubDate) {
      try {
        publishedDate = new Date(pubDate);
      } catch {
        publishedDate = new Date();
      }
    }

    const actualUrl = decodeGoogleNewsUrl(link);
    const slug = actualUrl.split("/").filter(Boolean).pop() || "";
    const sourceDomain = extractDomain(actualUrl);

    const candidate: NewsCandidate = {
      source: "googlenews-en",
      title: cleanText(title),
      summary: summary,
      imageUrl: imageUrl || "",
      url: actualUrl,
      externalId: guid || actualUrl,
      slug: slug,
      category: "Entertainment",
      publishedDate: publishedDate,
      language: "en",
      meta: {
        originalSource: source || sourceDomain,
        googleNewsUrl: link,
        needsImage: !imageUrl,
      },
    };

    return candidate;
  } catch (error) {
    console.error("Failed to parse RSS item:", error);
    return null;
  }
}

/**
 * Strip " - Source Name" suffix from Google News titles
 * e.g. "Celebrity does X - The Verge" → "Celebrity does X"
 */
function stripSourceFromTitle(title: string): string {
  const dashIndex = title.lastIndexOf(" - ");
  if (dashIndex > 20) {
    return title.substring(0, dashIndex).trim();
  }
  return title;
}

/**
 * Extract clean summary from Google News HTML description.
 * Google News wraps related headlines in <ol><li><a>Title</a> Source</li></ol>.
 * We extract article titles and combine them into readable text.
 */
function extractSummaryFromGoogleNewsHtml(html: string, fallbackTitle: string): string {
  if (!html) return fallbackTitle;

  // Extract all article titles from <a> tags inside <li>
  const linkTitles: string[] = [];
  const linkRegex = /<a[^>]+>([^<]+)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const text = cleanText(match[1]).trim();
    if (text && text.length > 15) {
      linkTitles.push(text);
    }
  }

  if (linkTitles.length === 0) {
    // Fallback: strip all HTML and use raw text
    const stripped = cleanText(html);
    return stripped.length > 20 ? stripped : fallbackTitle;
  }

  // Use the first headline as main summary, add "Also:" with others
  if (linkTitles.length === 1) {
    return linkTitles[0];
  }

  const mainHeadline = linkTitles[0];
  const otherHeadlines = linkTitles.slice(1, 3).join(". ");
  return `${mainHeadline}. Related: ${otherHeadlines}`;
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
 * Decode Google News article URL to get the actual source URL.
 * Google News encodes article URLs as base64 protobuf in the path:
 * https://news.google.com/rss/articles/CBMi...
 * The encoded blob contains the actual URL prefixed with some protobuf framing bytes.
 */
function decodeGoogleNewsUrl(url: string): string {
  try {
    if (!url.includes("news.google.com/rss/articles/")) {
      return url;
    }

    // Extract the base64 part from the URL
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/articles/");
    if (pathParts.length < 2) return url;

    let base64Part = pathParts[1];
    // Remove query params from the path portion
    if (base64Part.includes("?")) {
      base64Part = base64Part.split("?")[0];
    }

    // URL-safe base64 → standard base64
    const standardBase64 = base64Part.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    const padded = standardBase64 + "=".repeat((4 - (standardBase64.length % 4)) % 4);

    const decoded = Buffer.from(padded, "base64").toString("latin1");

    // Find the embedded URL — look for "http" in the decoded bytes
    const httpIndex = decoded.indexOf("http");
    if (httpIndex >= 0) {
      // Extract from "http" to the next non-URL character or end
      let extractedUrl = "";
      for (let i = httpIndex; i < decoded.length; i++) {
        const charCode = decoded.charCodeAt(i);
        // Stop at control characters (< 0x20) except common URL chars
        if (charCode < 0x20 || charCode > 0x7e) break;
        extractedUrl += decoded[i];
      }

      // Validate it looks like a proper URL
      if (extractedUrl.startsWith("http://") || extractedUrl.startsWith("https://")) {
        try {
          new URL(extractedUrl);
          return extractedUrl;
        } catch {
          // Invalid URL, fall through
        }
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
 * Fetch OG:image from article URLs for items missing images.
 * Runs in parallel with a short timeout to avoid slowing down ingest.
 */
async function enrichWithOGImages(
  news: NewsCandidate[],
  fetchImpl: typeof fetch
): Promise<void> {
  const needsImage = news.filter(n => !n.imageUrl || n.meta?.needsImage);
  if (needsImage.length === 0) return;

  console.log(`Fetching OG images for ${needsImage.length} articles...`);

  const BATCH_SIZE = 10;
  const FETCH_TIMEOUT = 5000;

  for (let i = 0; i < needsImage.length; i += BATCH_SIZE) {
    const batch = needsImage.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        try {
          const response = await fetchImpl(item.url, {
            method: "GET",
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html",
            },
            signal: controller.signal,
            redirect: "follow",
          });

          if (!response.ok) return null;

          // Read only first 50KB to find OG tags
          const reader = response.body?.getReader();
          if (!reader) return null;

          let html = "";
          const decoder = new TextDecoder();
          while (html.length < 50000) {
            const { done, value } = await reader.read();
            if (done) break;
            html += decoder.decode(value, { stream: true });
          }
          reader.cancel();

          const ogImage = extractOGImage(html);
          if (ogImage) {
            item.imageUrl = ogImage;
            if (item.meta) delete item.meta.needsImage;
          }

          // Also try to get a better description from og:description
          if (item.summary === item.title || item.summary.length < 50) {
            const ogDesc = extractOGDescription(html);
            if (ogDesc && ogDesc.length > 30) {
              item.summary = ogDesc;
            }
          }

          return ogImage;
        } catch {
          return null;
        } finally {
          clearTimeout(timeout);
        }
      })
    );

    const found = results.filter(r => r.status === "fulfilled" && r.value).length;
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: fetched ${found}/${batch.length} images`);
  }

  const withImages = news.filter(n => n.imageUrl && !n.meta?.needsImage).length;
  console.log(`OG image enrichment complete: ${withImages}/${news.length} articles have images`);
}

/**
 * Extract og:image from HTML
 */
function extractOGImage(html: string): string | null {
  // og:image
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch) return ogMatch[1];

  // Reversed attribute order
  const ogMatch2 = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch2) return ogMatch2[1];

  // twitter:image
  const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (twMatch) return twMatch[1];

  const twMatch2 = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
  if (twMatch2) return twMatch2[1];

  return null;
}

/**
 * Extract og:description from HTML
 */
function extractOGDescription(html: string): string | null {
  const ogMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch) return decodeHTMLEntities(ogMatch[1]);

  const ogMatch2 = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  if (ogMatch2) return decodeHTMLEntities(ogMatch2[1]);

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
