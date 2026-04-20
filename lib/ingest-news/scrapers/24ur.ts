import { NewsCandidate } from "../types";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_AGE_DAYS = 3;

export interface Fetch24urOptions {
  feedUrl?: string;
  feedUrls?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface Fetch24urSuccess {
  ok: true;
  news: NewsCandidate[];
  meta: {
    url: string;
    durationMs: number;
    totalFound: number;
    filtered: number;
  };
}

export interface Fetch24urError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type Fetch24urResult = Fetch24urSuccess | Fetch24urError;

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
    console.log(`24ur feed: XML length ${xml.length}`);

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

export async function fetch24urNews(
  options: Fetch24urOptions = {}
): Promise<Fetch24urResult> {
  const {
    feedUrl,
    feedUrls,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

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

  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  console.log(`Fetching ${urls.length} 24ur RSS feeds...`);

  const results = await Promise.all(
    urls.map((url) => fetchSingleFeed(url, timeoutMs, fetchImpl))
  );

  const durationMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    startedAt;

  const allNews: NewsCandidate[] = [];
  let totalFound = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const feedName = `feed-${i + 1}`;

    if ("error" in result) {
      console.warn(`${feedName} failed: ${result.error}`);
      errors.push(`${feedName}: ${result.error}`);
    } else {
      console.log(`${feedName}: found ${result.news.length} items`);
      allNews.push(...result.news);
      totalFound += result.totalFound;
    }
  }

  const seen = new Set<string>();
  const uniqueNews = allNews.filter((item) => {
    const key = item.externalId || item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(
    `Total unique news: ${uniqueNews.length} (${allNews.length} before dedup)`
  );

  const filteredNews = filterNews(uniqueNews, MAX_AGE_DAYS);

  if (errors.length === urls.length) {
    return {
      ok: false,
      error: {
        message: `All feeds failed: ${errors.join("; ")}`,
        url: urls.join(", "),
      },
    };
  }

  return {
    ok: true,
    news: filteredNews,
    meta: {
      url: urls.join(", "),
      durationMs,
      totalFound,
      filtered: filteredNews.length,
    },
  };
}

function parseRSSFeed(xml: string): NewsCandidate[] {
  const news: NewsCandidate[] = [];

  try {
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items = xml.match(itemRegex);

    if (!items) {
      console.log("No items found in 24ur RSS feed");
      return [];
    }

    console.log(`Found ${items.length} items in 24ur RSS feed`);

    for (const itemXml of items) {
      try {
        const candidate = parseRSSItem(itemXml);
        if (candidate) {
          news.push(candidate);
        }
      } catch (error) {
        console.error("Failed to parse 24ur RSS item:", error);
      }
    }

    console.log(`Parsed ${news.length} news items from ${items.length} RSS items`);
  } catch (error) {
    console.error("Failed to parse 24ur RSS feed:", error);
  }

  return news;
}

function parseRSSItem(itemXml: string): NewsCandidate | null {
  try {
    const title = extractCDATA(itemXml, "title") || extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const description =
      extractCDATA(itemXml, "description") || extractTag(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate");
    const guid = extractTag(itemXml, "guid");

    let imageUrl = extractMediaImage(itemXml);

    if (!imageUrl || imageUrl.includes(".mp4") || imageUrl.includes(".webm")) {
      imageUrl = extractEnclosureImage(itemXml) || imageUrl;
    }

    if (!imageUrl || imageUrl.includes(".mp4") || imageUrl.includes(".webm")) {
      imageUrl = extractImageFromContent(
        extractCDATA(itemXml, "content:encoded") || description
      ) || null;
    }

    if (imageUrl) {
      imageUrl = decodeImageUrl(imageUrl);
    }

    if (!title || !link) {
      return null;
    }

    if (!imageUrl) {
      return null;
    }

    let publishedDate = new Date();
    if (pubDate) {
      try {
        publishedDate = new Date(pubDate);
      } catch {
        publishedDate = new Date();
      }
    }

    const slug = link.split("/").filter(Boolean).pop() || "";

    const category = extractTag(itemXml, "category") || "Novice";

    const candidate: NewsCandidate = {
      source: "24ur",
      title: cleanText(title),
      summary: cleanText(description) || cleanText(title),
      imageUrl,
      url: link,
      externalId: guid || link,
      slug,
      category,
      publishedDate,
      language: "sl",
      meta: {
        rawCategory: category,
      },
    };

    return candidate;
  } catch (error) {
    console.error("Failed to parse 24ur RSS item:", error);
    return null;
  }
}

function decodeImageUrl(url: string): string {
  try {
    let decoded = decodeURIComponent(url);
    decoded = decoded.replace(/&#0?38;/g, "&");
    return decoded;
  } catch {
    return url;
  }
}

function extractCDATA(xml: string, tagName: string): string {
  const regex = new RegExp(
    `<${tagName}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tagName}>`,
    "i"
  );
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

function extractTag(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\\/${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

function extractMediaImage(xml: string): string | null {
  const mediaMatch = xml.match(
    /<media:content[^>]+url=["']([^"']+)["']/i
  );
  return mediaMatch ? mediaMatch[1] : null;
}

function extractEnclosureImage(xml: string): string | null {
  const match = xml.match(
    /<enclosure[^>]+url=["']([^"']+)["']/i
  );
  return match ? match[1] : null;
}

function extractImageFromContent(html: string): string | null {
  if (!html) return null;
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imgMatch ? imgMatch[1] : null;
}

function filterNews(
  news: NewsCandidate[],
  maxAgeDays: number
): NewsCandidate[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  return news.filter((item) => {
    if (!item.title || item.title.length < 10) return false;
    if (!item.imageUrl) return false;
    if (!item.url) return false;
    if (item.publishedDate && item.publishedDate < cutoffDate) return false;
    return true;
  });
}

function cleanText(text: string): string {
  if (!text) return "";

  let cleaned = text.replace(/<[^>]*>/g, "");
  cleaned = decodeHTMLEntities(cleaned);
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&#8216;": "\u2018",
    "&#8217;": "\u2019",
    "&#8220;": "\u201C",
    "&#8221;": "\u201D",
    "&#8211;": "\u2013",
    "&#8212;": "\u2014",
    "&#8230;": "\u2026",
    "&#038;": "&",
    "&#8203;": "",
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, "g"), char);
  }

  decoded = decoded.replace(/&#(\d+);/g, (_, num) =>
    String.fromCharCode(parseInt(num, 10))
  );

  return decoded;
}
