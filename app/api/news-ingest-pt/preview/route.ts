import { NextRequest, NextResponse } from "next/server";
import { fetchCarasNews } from "@/lib/ingest-news/scrapers/caras";
import { fetchFlashNews } from "@/lib/ingest-news/scrapers/flash";
import { fetchNoticiasAoMinutoNews } from "@/lib/ingest-news/scrapers/noticiasaominuto";
import { DEFAULT_NEWS_INGEST_CONFIG_PT } from "@/lib/ingest-news/config";

export async function POST(request: NextRequest) {
  try {
    console.log("Starting Portuguese news preview...");

    const body = await request.json().catch(() => ({}));
    const { sources } = body;

    const results: Record<string, any> = {};

    // Fetch from Caras.pt
    if (sources?.caras !== false && DEFAULT_NEWS_INGEST_CONFIG_PT.caras.enabled) {
      try {
        const config = DEFAULT_NEWS_INGEST_CONFIG_PT.caras;
        const result = await fetchCarasNews({
          feedUrls: config.feedUrls,
          timeoutMs: config.timeoutMs,
        });

        if (result.ok) {
          results.caras = {
            success: true,
            news: result.news,
            meta: result.meta,
          };
        } else {
          results.caras = {
            success: false,
            error: result.error.message,
          };
        }
      } catch (error) {
        results.caras = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    // Fetch from Flash.pt
    if (sources?.flash !== false && DEFAULT_NEWS_INGEST_CONFIG_PT.flash.enabled) {
      try {
        const config = DEFAULT_NEWS_INGEST_CONFIG_PT.flash;
        const result = await fetchFlashNews({
          feedUrl: config.feedUrl,
          timeoutMs: config.timeoutMs,
        });

        if (result.ok) {
          results.flash = {
            success: true,
            news: result.news,
            meta: result.meta,
          };
        } else {
          results.flash = {
            success: false,
            error: result.error.message,
          };
        }
      } catch (error) {
        results.flash = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    // Fetch from Notícias ao Minuto
    if (sources?.noticiasaominuto !== false && DEFAULT_NEWS_INGEST_CONFIG_PT.noticiasaominuto.enabled) {
      try {
        const config = DEFAULT_NEWS_INGEST_CONFIG_PT.noticiasaominuto;
        const result = await fetchNoticiasAoMinutoNews({
          feedUrls: config.feedUrls,
          timeoutMs: config.timeoutMs,
        });

        if (result.ok) {
          results.noticiasaominuto = {
            success: true,
            news: result.news,
            meta: result.meta,
          };
        } else {
          results.noticiasaominuto = {
            success: false,
            error: result.error.message,
          };
        }
      } catch (error) {
        results.noticiasaominuto = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    console.log("Portuguese news preview completed");

    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to preview Portuguese news", error);
    return NextResponse.json(
      { error: "Failed to preview Portuguese news" },
      { status: 500 }
    );
  }
}
