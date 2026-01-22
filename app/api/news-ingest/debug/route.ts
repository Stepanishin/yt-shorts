import { NextResponse } from "next/server";

/**
 * GET /api/news-ingest/debug
 * Debug endpoint to check what HTML we're getting from DiezMinutos
 */
export async function GET() {
  try {
    const url = "https://www.diezminutos.es/famosos/";

    console.log("Fetching HTML from:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status}` },
        { status: response.status }
      );
    }

    const html = await response.text();

    // Extract script tag
    const scriptMatch = html.match(/<script[^>]*id="__HRST_DATA__"[^>]*>([\s\S]*?)<\/script>/i);

    if (!scriptMatch) {
      // Check for alternative patterns
      const hasWindowHrst = html.includes("__HRST_DATA__");
      const hasHearst = html.includes("hearst");

      return NextResponse.json({
        found: false,
        htmlLength: html.length,
        hasWindowHrst,
        hasHearst,
        firstChars: html.substring(0, 1000),
        allScriptTags: html.match(/<script[^>]*id="[^"]*"[^>]*>/gi)?.slice(0, 10) || [],
      });
    }

    const jsonString = scriptMatch[1].trim();
    const parsed = JSON.parse(jsonString);

    return NextResponse.json({
      found: true,
      jsonKeys: Object.keys(parsed),
      dataKeys: parsed.data ? Object.keys(parsed.data) : null,
      contentServiceKeys: parsed.data?.contentService ? Object.keys(parsed.data.contentService) : null,
      contentKeys: parsed.data?.contentService?.content ? Object.keys(parsed.data.contentService.content) : null,
      resourcesLength: Array.isArray(parsed.data?.contentService?.content?.resources)
        ? parsed.data.contentService.content.resources.length
        : "not an array",
      sampleData: JSON.stringify(parsed).substring(0, 2000),
    });
  } catch (error) {
    console.error("Debug error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
