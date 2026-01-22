import { NewsCandidate } from "../types";

const BASE_URL = "https://www.diezminutos.es";
const FAMOSOS_PATH = "/famosos/";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_AGE_DAYS = 3; // Only fetch news from last 3 days

export interface FetchDiezMinutosOptions {
  baseUrl?: string;
  category?: string; // Default: "famosos"
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchDiezMinutosSuccess {
  ok: true;
  news: NewsCandidate[];
  meta: {
    url: string;
    durationMs: number;
    totalFound: number;
    filtered: number;
  };
}

export interface FetchDiezMinutosError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchDiezMinutosResult = FetchDiezMinutosSuccess | FetchDiezMinutosError;

/**
 * Fetch celebrity news from diezminutos.es
 */
export async function fetchDiezMinutosNews(
  options: FetchDiezMinutosOptions = {}
): Promise<FetchDiezMinutosResult> {
  const {
    baseUrl = BASE_URL,
    category = "famosos",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  const url = `${baseUrl}${FAMOSOS_PATH}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        error: {
          message: `DiezMinutos responded with status ${response.status}`,
          status: response.status,
          url,
        },
      };
    }

    const html = await response.text();

    console.log("HTML length:", html.length);
    console.log("Trying to parse from HTML directly...");

    // Try parsing from HTML first
    const htmlNews = parseNewsFromHTML(html);

    if (htmlNews.length > 0) {
      console.log(`Found ${htmlNews.length} news items from HTML parsing`);
      const filteredNews = filterNews(htmlNews, MAX_AGE_DAYS);

      return {
        ok: true,
        news: filteredNews,
        meta: {
          url,
          durationMs,
          totalFound: htmlNews.length,
          filtered: filteredNews.length,
        },
      };
    }

    // Fallback to JSON parsing
    const jsonData = extractEmbeddedJSON(html);

    if (!jsonData) {
      return {
        ok: false,
        error: {
          message: "Could not find articles in HTML or __HRST_DATA__ JSON",
          url,
        },
      };
    }

    // Parse and filter news
    const allNews = parseNewsFromJSON(jsonData);
    const filteredNews = filterNews(allNews, MAX_AGE_DAYS);

    return {
      ok: true,
      news: filteredNews,
      meta: {
        url,
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
          ? `Request to DiezMinutos timed out after ${timeoutMs}ms`
          : "Failed to fetch DiezMinutos news",
        url,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract embedded JSON from HTML
 */
function extractEmbeddedJSON(html: string): any | null {
  try {
    // Look for <script id="__HRST_DATA__" type="application/json">...</script>
    const scriptMatch = html.match(/<script[^>]*id="__HRST_DATA__"[^>]*>([\s\S]*?)<\/script>/i);

    if (!scriptMatch || !scriptMatch[1]) {
      console.warn("Could not find __HRST_DATA__ script tag in HTML");
      console.log("HTML length:", html.length);
      console.log("First 500 chars:", html.substring(0, 500));

      // Try alternative patterns
      const altMatch1 = html.match(/<script[^>]*>([\s\S]*?window\.__HRST_DATA__[\s\S]*?)<\/script>/i);
      if (altMatch1) {
        console.log("Found alternative pattern with window.__HRST_DATA__");
      }

      return null;
    }

    const jsonString = scriptMatch[1].trim();
    const parsed = JSON.parse(jsonString);

    console.log("Parsed JSON keys:", Object.keys(parsed));
    if (parsed.data) {
      console.log("Data keys:", Object.keys(parsed.data));
    }

    return parsed;
  } catch (error) {
    console.error("Failed to parse embedded JSON:", error);
    return null;
  }
}

/**
 * Parse news items from JSON structure
 */
function parseNewsFromJSON(jsonData: any): NewsCandidate[] {
  try {
    console.log("Parsing news from JSON, top-level keys:", Object.keys(jsonData || {}));

    // Deep exploration of the structure
    console.log("\n=== Deep structure exploration ===");

    // Check 'landing' key
    if (jsonData?.landing) {
      console.log("Found 'landing', type:", typeof jsonData.landing);
      if (typeof jsonData.landing === 'object' && jsonData.landing !== null) {
        console.log("  landing keys:", Object.keys(jsonData.landing));

        // Explore all nested keys
        for (const key of Object.keys(jsonData.landing)) {
          const value = jsonData.landing[key];
          console.log(`  landing.${key} type:`, typeof value);

          if (Array.isArray(value)) {
            console.log(`    landing.${key} is array with length:`, value.length);
            if (value.length > 0 && typeof value[0] === 'object') {
              console.log(`    First item keys:`, Object.keys(value[0]));
            }
          } else if (typeof value === 'object' && value !== null) {
            console.log(`    landing.${key} is object with keys:`, Object.keys(value));

            // If this object has blocks, explore it
            if (value.blocks) {
              console.log(`    landing.${key}.blocks found! Type:`, Array.isArray(value.blocks) ? "array" : typeof value.blocks);
              if (Array.isArray(value.blocks) && value.blocks.length > 0) {
                console.log(`    landing.${key}.blocks length:`, value.blocks.length);
                const firstBlock = value.blocks[0];
                console.log(`    First block in landing.${key}.blocks keys:`, Object.keys(firstBlock));

                // Check for feeds
                if (firstBlock.feeds && Array.isArray(firstBlock.feeds)) {
                  console.log(`    First block has feeds! Length:`, firstBlock.feeds.length);
                  if (firstBlock.feeds.length > 0) {
                    const firstFeed = firstBlock.feeds[0];
                    console.log(`    First feed keys:`, Object.keys(firstFeed));

                    if (firstFeed.resources && Array.isArray(firstFeed.resources)) {
                      console.log(`    First feed has resources! Length:`, firstFeed.resources.length);
                      if (firstFeed.resources.length > 0) {
                        console.log(`    First resource keys:`, Object.keys(firstFeed.resources[0]));
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Try to find blocks/articles in various locations
    console.log("\n=== Searching for blocks/articles in all top-level keys ===");

    for (const topKey of Object.keys(jsonData || {})) {
      const topValue = jsonData[topKey];

      if (Array.isArray(topValue)) {
        console.log(`${topKey} is array with length:`, topValue.length);
      } else if (typeof topValue === 'object' && topValue !== null) {
        const nestedKeys = Object.keys(topValue);

        // Look for 'blocks' or 'articles' or 'resources' in nested keys
        const hasBlocks = nestedKeys.includes('blocks');
        const hasArticles = nestedKeys.includes('articles');
        const hasResources = nestedKeys.includes('resources');

        if (hasBlocks || hasArticles || hasResources) {
          console.log(`\n${topKey} contains interesting keys:`);
          if (hasBlocks) console.log(`  - ${topKey}.blocks`);
          if (hasArticles) console.log(`  - ${topKey}.articles`);
          if (hasResources) console.log(`  - ${topKey}.resources`);
        }

        // Deep search in nested objects
        for (const nestedKey of nestedKeys) {
          const nestedValue = topValue[nestedKey];

          if (nestedKey === 'blocks' || nestedKey === 'articles' || nestedKey === 'resources') {
            if (Array.isArray(nestedValue)) {
              console.log(`\nFOUND: ${topKey}.${nestedKey} is array with length:`, nestedValue.length);
              if (nestedValue.length > 0) {
                console.log(`  First item keys:`, Object.keys(nestedValue[0]));
                console.log(`  First item sample:`, JSON.stringify(nestedValue[0]).substring(0, 300));
              }
            }
          }
        }
      }
    }

    // Try to find blocks in landing structure first
    let blocks = jsonData?.landing?.blocks;

    if (!blocks || !Array.isArray(blocks)) {
      console.log("\nBlocks not found at landing.blocks, trying alternative locations...");

      // Try alternative locations based on common patterns
      blocks =
        jsonData?.landing?.layout?.blocks ||
        jsonData?.landing?.value?.blocks ||
        jsonData?.data?.blocks ||
        jsonData?.content?.blocks ||
        jsonData?.page?.blocks;
    }

    if (!blocks || !Array.isArray(blocks)) {
      console.warn("Could not find blocks array in any expected location");
      return [];
    }

    console.log(`Found ${blocks.length} blocks`);

    const allArticles: any[] = [];

    // Iterate through blocks to find resources
    for (const block of blocks) {
      if (!block.feeds || !Array.isArray(block.feeds)) {
        continue;
      }

      for (const feed of block.feeds) {
        if (!feed.resources || !Array.isArray(feed.resources)) {
          continue;
        }

        allArticles.push(...feed.resources);
      }
    }

    console.log(`Found ${allArticles.length} total articles in blocks`);

    if (allArticles.length === 0) {
      return [];
    }

    // Parse articles into NewsCandidate format
    const news: NewsCandidate[] = [];
    for (const article of allArticles) {
      const candidate = mapHRSTResourceToNewsCandidate(article);
      if (candidate) {
        news.push(candidate);
      }
    }

    console.log(`Parsed ${news.length} news items from ${allArticles.length} articles`);
    return news;
  } catch (error) {
    console.error("Failed to parse news from JSON:", error);
    return [];
  }
}

/**
 * Parse articles from landing structure
 */
function parseArticlesFromLanding(articles: any[]): NewsCandidate[] {
  const news: NewsCandidate[] = [];

  for (const article of articles) {
    const candidate = mapResourceToNewsCandidate(article);
    if (candidate) {
      news.push(candidate);
    }
  }

  console.log(`Parsed ${news.length} news items from ${articles.length} articles`);
  return news;
}

/**
 * Map a single HRST resource to NewsCandidate
 */
function mapHRSTResourceToNewsCandidate(resource: any): NewsCandidate | null {
  try {
    // Extract fields from new HRST structure
    const type = resource?.type;

    // Only process Content type
    if (type !== "Content") {
      return null;
    }

    const id = resource?.id;
    const displayId = resource?.display_id;
    const slug = resource?.slug || "";

    // Get title from metadata
    const metadata = resource?.metadata || {};
    const title = metadata?.index_title || metadata?.short_title || "";

    // Get summary from metadata.dek (remove HTML tags)
    const dekHTML = metadata?.dek || metadata?.social_dek || "";
    const summary = cleanText(dekHTML);

    // Get image from media array
    let imageUrl = "";
    if (Array.isArray(resource?.media) && resource.media.length > 0) {
      // Find first image with hips_url
      const imageMedia = resource.media.find((m: any) => m?.hips_url);
      imageUrl = imageMedia?.hips_url || "";
    }

    // Must have image
    if (!imageUrl) {
      return null;
    }

    // Build URL from section, subsection, display_id and slug
    // Format: /{section.slug}/{subsection.slug}/a{display_id}/{slug}/
    const sectionSlug = resource?.section?.slug || "";
    const subsectionSlug = resource?.subsection?.slug || "";
    const url = subsectionSlug
      ? `${BASE_URL}/${sectionSlug}/${subsectionSlug}/a${displayId}/${slug}/`
      : `${BASE_URL}/${sectionSlug}/a${displayId}/${slug}/`;

    // Get category name
    const category = resource?.subsection?.name || resource?.section?.name || "Famosos";

    // Get published date
    const publishFrom = resource?.publish_from;
    const publishedDate = publishFrom ? new Date(publishFrom) : new Date();

    // Get authors
    const authors = resource?.authors || [];
    const author = Array.isArray(authors) && authors.length > 0
      ? authors[0]?.name || ""
      : "";

    // Build NewsCandidate
    const candidate: NewsCandidate = {
      source: "diezminutos",
      title: cleanText(title),
      summary: summary,
      imageUrl: imageUrl,
      url: url,
      externalId: id || String(displayId),
      slug: slug,
      category: category,
      publishedDate: publishedDate,
      author: author,
      language: "es",
      meta: {
        type: type,
        displayId: displayId,
      },
    };

    return candidate;
  } catch (error) {
    console.error("Failed to map HRST resource to NewsCandidate:", error);
    return null;
  }
}

/**
 * Map a single resource to NewsCandidate (legacy Arc Publishing structure)
 */
function mapResourceToNewsCandidate(resource: any): NewsCandidate | null {
  try {
    // Extract fields
    const id = resource?._id || resource?.id;
    const type = resource?.type;

    // Only process stories
    if (type !== "story") {
      return null;
    }

    const headlines = resource?.headlines;
    const title = headlines?.basic || headlines?.web || "";

    const descriptions = resource?.description;
    const summary = descriptions?.basic || descriptions?.web || "";

    // Check for image
    const promoItems = resource?.promo_items;
    const basicImage = promoItems?.basic;
    const imageUrl = basicImage?.url || basicImage?.resized_urls?.original;

    // Must have image
    if (!imageUrl) {
      return null;
    }

    // Get canonical URL
    const canonicalUrl = resource?.canonical_url || "";
    const url = canonicalUrl ? `${BASE_URL}${canonicalUrl}` : "";

    // Get slug
    const slug = resource?.slug || "";

    // Get category
    const taxonomy = resource?.taxonomy;
    const primarySection = taxonomy?.primary_section;
    const sectionName = primarySection?.name || "";

    // Get published date
    const displayDate = resource?.display_date;
    const publishedDate = displayDate ? new Date(displayDate) : new Date();

    // Get author
    const credits = resource?.credits;
    const byline = credits?.by;
    const author = Array.isArray(byline) && byline.length > 0
      ? byline[0]?.name || ""
      : "";

    // Build NewsCandidate
    const candidate: NewsCandidate = {
      source: "diezminutos",
      title: cleanText(title),
      summary: cleanText(summary),
      imageUrl: imageUrl,
      url: url,
      externalId: String(id),
      slug: slug,
      category: sectionName,
      publishedDate: publishedDate,
      author: author,
      language: "es",
      meta: {
        type: type,
        rawResource: resource, // Store full resource for debugging
      },
    };

    return candidate;
  } catch (error) {
    console.error("Failed to map resource to NewsCandidate:", error);
    return null;
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

    // Check age (if publishedDate is available)
    if (item.publishedDate && item.publishedDate < cutoffDate) {
      return false;
    }

    // Category filter: Must be related to "Famosos" (celebrities)
    // Accept if category contains "famosos", "celebrit", or is empty (we're already on famosos page)
    const category = item.category?.toLowerCase() || "";
    const isFamososCategory =
      category === "" ||
      category.includes("famoso") ||
      category.includes("celebrit") ||
      category.includes("estrella") ||
      category.includes("artista");

    if (!isFamososCategory) {
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

/**
 * Parse news from HTML structure
 * Look for article cards in the page
 */
function parseNewsFromHTML(html: string): NewsCandidate[] {
  const news: NewsCandidate[] = [];

  try {
    // Look for article elements - common patterns in news sites
    // Try to find article cards with class or data attributes
    const articlePatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/gi,
      /<div[^>]*class="[^"]*card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<div[^>]*class="[^"]*item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ];

    let matches: string[] = [];
    for (const pattern of articlePatterns) {
      const found = html.match(pattern);
      if (found && found.length > 0) {
        console.log(`Found ${found.length} matches with pattern:`, pattern.source.substring(0, 50));
        matches = found;
        break;
      }
    }

    if (matches.length === 0) {
      console.log("No article elements found in HTML");
      return [];
    }

    console.log(`Processing ${matches.length} article elements`);

    for (const match of matches.slice(0, 20)) { // Limit to first 20
      try {
        // Extract title from h1, h2, h3, or link text
        const titleMatch = match.match(/<(?:h[1-3]|a)[^>]*>([^<]+)<\/(?:h[1-3]|a)>/i);
        const title = titleMatch ? cleanText(titleMatch[1]) : "";

        // Extract link URL
        const linkMatch = match.match(/<a[^>]*href="([^"]+)"/i);
        const url = linkMatch ? linkMatch[1] : "";

        // Extract image URL
        const imgMatch = match.match(/(?:src|data-src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
        const imageUrl = imgMatch ? imgMatch[1] : "";

        // Extract description/summary
        const descMatch = match.match(/<p[^>]*>([^<]{20,})<\/p>/i);
        const summary = descMatch ? cleanText(descMatch[1]) : "";

        // Only add if we have minimum required fields
        if (title && url && imageUrl) {
          // Make URL absolute if relative
          const absoluteUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
          const absoluteImageUrl = imageUrl.startsWith('http') ? imageUrl : `${BASE_URL}${imageUrl}`;

          const candidate: NewsCandidate = {
            source: "diezminutos",
            title: title,
            summary: summary || title, // Use title as fallback
            imageUrl: absoluteImageUrl,
            url: absoluteUrl,
            slug: url.split('/').filter(Boolean).pop() || "",
            category: "Famosos",
            language: "es",
          };

          news.push(candidate);
        }
      } catch (parseError) {
        console.error("Error parsing article element:", parseError);
      }
    }

    console.log(`Parsed ${news.length} news items from HTML`);
  } catch (error) {
    console.error("Failed to parse news from HTML:", error);
  }

  return news;
}
