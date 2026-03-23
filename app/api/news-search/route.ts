import { NextResponse } from "next/server";

export interface SearchResult {
  title: string;
  url: string;
}

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

    // Fetch hola.com search results by scraping Google
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      query + " site:hola.com"
    )}&num=15`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Google search failed with status ${response.status}` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const results = parseGoogleResults(html);

    return NextResponse.json({ results, query });
  } catch (error) {
    console.error("News search failed:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}

function parseGoogleResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Extract links that point to hola.com
  const linkRegex = /href="(https?:\/\/www\.hola\.com\/[^"]+)"/g;
  let match;
  const seen = new Set<string>();

  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];
    // Clean Google redirect URLs
    if (url.includes("&")) {
      url = url.split("&")[0];
    }
    // Skip non-article URLs
    if (
      url.includes("/biografias/") ||
      url.includes("/tags/") ||
      url.includes("/feeds/") ||
      url.includes("/search") ||
      seen.has(url)
    ) {
      continue;
    }
    seen.add(url);

    // Extract title from the URL slug
    const slug = url.split("/").filter(Boolean).pop() || "";
    const title = slug
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    results.push({ title, url });
  }

  return results;
}
