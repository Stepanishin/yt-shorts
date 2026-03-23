import { NextResponse } from "next/server";
import { insertNewsCandidates } from "@/lib/ingest-news/storage";
import { NewsCandidate } from "@/lib/ingest-news/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || !url.includes("hola.com")) {
      return NextResponse.json(
        { error: "Valid hola.com URL is required" },
        { status: 400 }
      );
    }

    // Fetch and parse the article page
    const articleData = await fetchArticleData(url);

    if (!articleData) {
      return NextResponse.json(
        { error: "Failed to parse article from URL" },
        { status: 422 }
      );
    }

    // Insert into database
    const result = await insertNewsCandidates([articleData]);

    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      article: {
        title: articleData.title,
        summary: articleData.summary,
        imageUrl: articleData.imageUrl,
        url: articleData.url,
      },
    });
  } catch (error) {
    console.error("Failed to add news from search:", error);
    return NextResponse.json(
      { error: "Failed to add news article" },
      { status: 500 }
    );
  }
}

async function fetchArticleData(
  url: string
): Promise<NewsCandidate | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      console.error(`Article fetch failed: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract og:title
    const title = extractMeta(html, "og:title") || extractTagContent(html, "title") || "";

    // Extract og:description
    const summary = extractMeta(html, "og:description") || extractMeta(html, "description") || "";

    // Extract og:image
    const imageUrl = extractMeta(html, "og:image") || "";

    // Extract published date
    const publishedDate =
      extractMeta(html, "article:published_time") ||
      extractMeta(html, "datePublished") ||
      extractMetaName(html, "date") ||
      "";

    // Extract author
    const author = extractMeta(html, "article:author") || extractMetaName(html, "author") || "";

    if (!title || !imageUrl) {
      console.error("Missing required fields: title or imageUrl");
      return null;
    }

    // Extract externalId from URL
    const urlParts = url.split("/").filter(Boolean);
    const externalId =
      urlParts.find((part) => /^\d{8,}/.test(part)) || url;

    const slug = urlParts.pop() || "";

    // Determine category from URL
    const isCelebrity =
      url.includes("/famosos/") ||
      url.includes("/celebrities/") ||
      url.includes("/celebrit");
    const isRoyalty =
      url.includes("/realeza/") || url.includes("/casas-reales/");

    const category = isRoyalty
      ? "Realeza"
      : isCelebrity
      ? "Famosos"
      : "General";

    return {
      source: "hola",
      title,
      summary: summary || title,
      imageUrl,
      url,
      externalId,
      slug,
      category,
      publishedDate: publishedDate ? new Date(publishedDate) : new Date(),
      author: author || undefined,
      language: "es",
      meta: {
        addedVia: "news-search",
      },
    };
  } catch (error) {
    console.error("Error fetching article:", error);
    return null;
  }
}

function extractMeta(html: string, property: string): string {
  const regex = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const match = html.match(regex);
  if (match) return match[1];

  // Try reversed order (content before property)
  const regex2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
    "i"
  );
  const match2 = html.match(regex2);
  return match2 ? match2[1] : "";
}

function extractMetaName(html: string, name: string): string {
  const regex = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const match = html.match(regex);
  if (match) return match[1];

  const regex2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`,
    "i"
  );
  const match2 = html.match(regex2);
  return match2 ? match2[1] : "";
}

function extractTagContent(html: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i");
  const match = html.match(regex);
  return match ? match[1].trim() : "";
}
