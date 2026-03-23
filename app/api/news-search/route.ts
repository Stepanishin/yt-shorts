import { NextResponse } from "next/server";

export interface SearchResult {
  title: string;
  url: string;
  lastmod?: string;
}

// How many quarterly sitemaps to search (most recent first) — 20 = 5 years
const MAX_SITEMAPS = 20;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required (min 2 characters)" },
        { status: 400 }
      );
    }

    // Normalize query to URL-slug-friendly format for searching in sitemaps
    const slugQuery = normalizeToSlug(query.trim());

    // Get list of quarterly sitemaps to search
    const sitemapUrls = getRecentSitemapUrls(MAX_SITEMAPS);

    console.log(
      `Searching ${sitemapUrls.length} sitemaps for "${slugQuery}"...`
    );

    // Fetch sitemaps in parallel
    const sitemapResults = await Promise.all(
      sitemapUrls.map((url) => searchSitemap(url, slugQuery))
    );

    // Combine and deduplicate results
    const allResults: SearchResult[] = [];
    const seen = new Set<string>();

    for (const results of sitemapResults) {
      for (const result of results) {
        if (!seen.has(result.url)) {
          seen.add(result.url);
          allResults.push(result);
        }
      }
    }

    // Sort by lastmod (newest first), then by URL
    allResults.sort((a, b) => {
      if (a.lastmod && b.lastmod) return b.lastmod.localeCompare(a.lastmod);
      return b.url.localeCompare(a.url);
    });

    console.log(`Found ${allResults.length} results for "${query}"`);

    return NextResponse.json({ results: allResults.slice(0, 20), query });
  } catch (error) {
    console.error("News search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

function normalizeToSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics (á->a, ú->u, etc.)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getRecentSitemapUrls(count: number): string[] {
  const urls: string[] = [];
  const now = new Date();
  let year = now.getFullYear();
  let quarter = Math.ceil((now.getMonth() + 1) / 3);

  for (let i = 0; i < count; i++) {
    urls.push(
      `https://www.hola.com/sitemap/sitemap-${year}-q${quarter}.xml`
    );
    quarter--;
    if (quarter === 0) {
      quarter = 4;
      year--;
    }
  }

  return urls;
}

async function searchSitemap(
  sitemapUrl: string,
  slugQuery: string
): Promise<SearchResult[]> {
  try {
    const response = await fetch(sitemapUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`Sitemap ${sitemapUrl} returned ${response.status}`);
      return [];
    }

    const xml = await response.text();
    return parseUrlsFromSitemap(xml, slugQuery);
  } catch (error) {
    console.warn(`Failed to fetch sitemap ${sitemapUrl}:`, error);
    return [];
  }
}

function parseUrlsFromSitemap(
  xml: string,
  slugQuery: string
): SearchResult[] {
  const results: SearchResult[] = [];

  // Split query into parts for multi-word matching (e.g. "rocio-durcal" -> ["rocio", "durcal"])
  const queryParts = slugQuery.split("-").filter((p) => p.length > 2);

  // Extract <url> blocks
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/g;
  let match;

  while ((match = urlBlockRegex.exec(xml)) !== null) {
    const block = match[1];

    // Extract <loc>
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
    if (!locMatch) continue;

    const url = locMatch[1];

    // Check if URL slug contains all query parts
    const urlLower = url.toLowerCase();
    const allPartsMatch = queryParts.every((part) => urlLower.includes(part));

    if (!allPartsMatch) continue;

    // Skip non-article URLs
    if (
      url.includes("/biografias/") ||
      url.includes("/tags/") ||
      url.includes("/feeds/") ||
      url.includes("/sitemap/")
    ) {
      continue;
    }

    // Extract <lastmod>
    const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/);
    const lastmod = lastmodMatch ? lastmodMatch[1] : undefined;

    // Extract title from URL slug
    const slug = url.split("/").filter(Boolean).pop() || "";
    const title = slug
      .replace(/-/g, " ")
      .replace(/^\d+\s*/, "") // Remove leading numbers
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();

    results.push({ title, url, lastmod });
  }

  return results;
}
