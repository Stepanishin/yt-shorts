import { NextRequest, NextResponse } from "next/server";
import { fetchPageSixNews } from "@/lib/ingest-news/scrapers/pagesix";
import { DEFAULT_NEWS_INGEST_CONFIG_EN } from "@/lib/ingest-news/config";

export async function POST(request: NextRequest) {
  try {
    console.log("Starting English news preview...");

    const body = await request.json().catch(() => ({}));
    const { sources } = body;

    const results: Record<string, any> = {};

    if (sources?.pagesix !== false && DEFAULT_NEWS_INGEST_CONFIG_EN.pagesix.enabled) {
      try {
        const config = DEFAULT_NEWS_INGEST_CONFIG_EN.pagesix;
        const result = await fetchPageSixNews({
          feedUrls: config.feedUrls,
          timeoutMs: config.timeoutMs,
        });

        if (result.ok) {
          results.pagesix = {
            success: true,
            news: result.news,
            meta: result.meta,
          };
        } else {
          results.pagesix = {
            success: false,
            error: result.error.message,
          };
        }
      } catch (error) {
        results.pagesix = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    console.log("English news preview completed");

    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to preview English news", error);
    return NextResponse.json(
      { error: "Failed to preview English news" },
      { status: 500 }
    );
  }
}
