import { NewsPreviewRequest, NewsPreviewBundle, NewsCandidate } from "./types";
import { fetchDiezMinutosNews } from "./scrapers/diezminutos";
import { fetchHolaNews } from "./scrapers/hola";

/**
 * Collect news preview without inserting into database
 * Used for testing and preview purposes
 */
export async function collectNewsPreview(
  request: NewsPreviewRequest
): Promise<NewsPreviewBundle> {
  const allNews: NewsCandidate[] = [];
  const meta: Record<string, unknown> = {
    sources: {},
  };

  // Fetch from DiezMinutos if enabled
  if (request.diezminutos?.enabled !== false) {
    const result = await fetchDiezMinutosNews({
      baseUrl: request.diezminutos?.baseUrl,
      category: request.diezminutos?.category,
      timeoutMs: request.diezminutos?.timeoutMs,
    });

    if (result.ok) {
      allNews.push(...result.news);
      meta.sources = {
        ...meta.sources as Record<string, unknown>,
        diezminutos: {
          success: true,
          totalFound: result.meta.totalFound,
          filtered: result.meta.filtered,
          durationMs: result.meta.durationMs,
        },
      };
    } else {
      meta.sources = {
        ...meta.sources as Record<string, unknown>,
        diezminutos: {
          success: false,
          error: result.error.message,
        },
      };
      console.error("DiezMinutos fetch failed:", result.error);
    }
  }

  // Fetch from Hola.com if enabled
  if (request.hola?.enabled !== false) {
    const result = await fetchHolaNews({
      feedUrl: request.hola?.feedUrl,
      timeoutMs: request.hola?.timeoutMs,
    });

    if (result.ok) {
      allNews.push(...result.news);
      meta.sources = {
        ...meta.sources as Record<string, unknown>,
        hola: {
          success: true,
          totalFound: result.meta.totalFound,
          filtered: result.meta.filtered,
          durationMs: result.meta.durationMs,
        },
      };
    } else {
      meta.sources = {
        ...meta.sources as Record<string, unknown>,
        hola: {
          success: false,
          error: result.error.message,
        },
      };
      console.error("Hola.com fetch failed:", result.error);
    }
  }

  return {
    news: allNews,
    meta,
  };
}
