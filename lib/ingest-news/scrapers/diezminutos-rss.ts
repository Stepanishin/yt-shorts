import { NewsCandidate } from "../types";

/**
 * RSS-based Diez Minutos scraper (replaces the fragile HTML category parser).
 * Feed: ~50 items, hi-res Hearst images in media:content, short descriptions.
 * Full text is enriched by fetching the article page (first paragraphs).
 */

const DEFAULT_FEED_URL = "https://www.diezminutos.es/rss/all.xml/";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_AGE_DAYS = 3;
const MAX_ENRICH = 30; // Cap article-page fetches per run
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface FetchDiezMinutosRSSOptions {
  feedUrl?: string;
  timeoutMs?: number;
  maxAgeDays?: number;
  fetchImpl?: typeof fetch;
}

export type FetchDiezMinutosRSSResult =
  | { ok: true; news: NewsCandidate[]; meta: { url: string; totalFound: number; enriched: number } }
  | { ok: false; error: { message: string; url: string } };

export async function fetchDiezMinutosRSS(
  options: FetchDiezMinutosRSSOptions = {}
): Promise<FetchDiezMinutosRSSResult> {
  const {
    feedUrl = DEFAULT_FEED_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAgeDays = DEFAULT_MAX_AGE_DAYS,
    fetchImpl = fetch,
  } = options;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetchImpl(feedUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml,application/xml,text/xml,*/*",
        "Accept-Language": "es-ES,es;q=0.9",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (!response.ok) {
      return { ok: false, error: { message: `DiezMinutos RSS status ${response.status}`, url: feedUrl } };
    }

    const xml = await response.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    console.log(`DiezMinutos RSS: ${items.length} items in feed`);

    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const candidates: NewsCandidate[] = [];

    for (const itemXml of items) {
      const title = extractCDATA(itemXml, "title");
      const link = extractTag(itemXml, "link");
      const description = stripTags(extractCDATA(itemXml, "description"));
      const pubDate = extractTag(itemXml, "pubDate");
      const guid = extractTag(itemXml, "guid") || link;
      const imageUrl = (itemXml.match(/<media:content[^>]+url="([^"]+)"/) ||
        itemXml.match(/<enclosure[^>]+url="([^"]+)"/))?.[1];

      if (!title || !link || !imageUrl) continue;
      if (imageUrl.includes(".mp4") || imageUrl.includes(".webm")) continue;

      const publishedDate = pubDate ? new Date(pubDate) : new Date();
      if (isNaN(publishedDate.getTime()) || publishedDate.getTime() < cutoff) continue;

      candidates.push({
        source: "diezminutos",
        title,
        summary: description || title,
        imageUrl,
        url: link,
        externalId: guid,
        category: "famosos",
        publishedDate,
        language: "es",
      });
    }

    // Enrich with article full text (first paragraphs), capped and sequential-ish
    let enriched = 0;
    for (const c of candidates.slice(0, MAX_ENRICH)) {
      const fullText = await fetchArticleText(c.url, timeoutMs, fetchImpl);
      if (fullText && fullText.length > (c.summary?.length || 0)) {
        c.summary = fullText;
        enriched++;
      }
    }

    console.log(`DiezMinutos RSS: ${candidates.length} fresh candidates, ${enriched} enriched with article text`);
    return { ok: true, news: candidates, meta: { url: feedUrl, totalFound: items.length, enriched } };
  } catch (error) {
    return { ok: false, error: { message: (error as Error).message, url: feedUrl } };
  }
}

/**
 * Fetch article page and extract the first meaningful paragraphs (~1200 chars).
 */
async function fetchArticleText(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "es-ES,es;q=0.9" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const html = await res.text();
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => stripTags(m[1]))
      .filter((t) => t.length > 60 && !/cookies|suscríbete|newsletter|publicidad|todos los derechos/i.test(t));

    if (!paragraphs.length) return null;

    let text = "";
    for (const p of paragraphs) {
      if (text.length >= 1200) break;
      text += (text ? " " : "") + p;
    }
    return text.trim() || null;
  } catch {
    return null;
  }
}

function extractCDATA(xml: string, tag: string): string {
  const cdata = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  if (cdata) return cdata[1].trim();
  return extractTag(xml, tag);
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}
