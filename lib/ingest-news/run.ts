import { fetchDiezMinutosNews } from "./scrapers/diezminutos";
import { fetchHolaNews } from "./scrapers/hola";
import {
  insertNewsCandidates,
  deleteOldPendingNews,
  updateSourceState,
} from "./storage";
import { DEFAULT_NEWS_INGEST_CONFIG } from "./config";
import { NewsCandidate } from "./types";

export interface RunNewsIngestOptions {
  sources?: {
    diezminutos?: boolean;
    hola?: boolean;
  };
}

export interface RunNewsIngestResult {
  success: boolean;
  totalFetched: number;
  totalInserted: number;
  totalDeleted: number;
  sources: Record<string, {
    success: boolean;
    fetched?: number;
    inserted?: number;
    error?: string;
  }>;
}

/**
 * Run news ingest process
 * Fetches news from configured sources and stores in database
 */
export async function runNewsIngest(
  options: RunNewsIngestOptions = {}
): Promise<RunNewsIngestResult> {
  const result: RunNewsIngestResult = {
    success: true,
    totalFetched: 0,
    totalInserted: 0,
    totalDeleted: 0,
    sources: {},
  };

  console.log("Starting news ingest process...");

  // Delete old pending news first (older than 3 days)
  try {
    const deletedCount = await deleteOldPendingNews(3);
    result.totalDeleted = deletedCount;
    console.log(`Deleted ${deletedCount} old pending news items`);
  } catch (error) {
    console.error("Failed to delete old pending news:", error);
  }

  // Fetch from DiezMinutos (disabled by default, replaced by Hola.com)
  if (options.sources?.diezminutos !== false && DEFAULT_NEWS_INGEST_CONFIG.diezminutos.enabled) {
    try {
      const config = DEFAULT_NEWS_INGEST_CONFIG.diezminutos;

      console.log(`Fetching news from DiezMinutos (${config.baseUrl})...`);

      const fetchResult = await fetchDiezMinutosNews({
        baseUrl: config.baseUrl,
        category: config.category,
        timeoutMs: config.timeoutMs,
      });

      if (fetchResult.ok) {
        const news = fetchResult.news;
        console.log(`Fetched ${news.length} news items from DiezMinutos`);

        // Insert into database
        const insertResult = await insertNewsCandidates(news);

        // Update source state
        await updateSourceState(
          "diezminutos",
          "famosos",
          1, // Page number (DiezMinutos doesn't use pagination, always 1)
          insertResult.inserted
        );

        result.totalFetched += news.length;
        result.totalInserted += insertResult.inserted;
        result.sources.diezminutos = {
          success: true,
          fetched: news.length,
          inserted: insertResult.inserted,
        };

        console.log(`Inserted ${insertResult.inserted} new news items from DiezMinutos`);
      } else {
        console.error("DiezMinutos fetch failed:", fetchResult.error);
        result.sources.diezminutos = {
          success: false,
          error: fetchResult.error.message,
        };
        result.success = false;
      }
    } catch (error) {
      console.error("DiezMinutos ingest failed:", error);
      result.sources.diezminutos = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      result.success = false;
    }
  }

  // Fetch from Hola.com
  if (options.sources?.hola !== false && DEFAULT_NEWS_INGEST_CONFIG.hola.enabled) {
    try {
      const config = DEFAULT_NEWS_INGEST_CONFIG.hola;

      console.log(`Fetching news from Hola.com RSS feed...`);

      const fetchResult = await fetchHolaNews({
        feedUrls: config.feedUrls,
        timeoutMs: config.timeoutMs,
      });

      if (fetchResult.ok) {
        const news = fetchResult.news;
        console.log(`Fetched ${news.length} celebrity news items from Hola.com (${fetchResult.meta.totalFound} total)`);

        // Insert into database
        const insertResult = await insertNewsCandidates(news);

        // Update source state
        await updateSourceState(
          "hola",
          "famosos",
          1, // RSS feeds don't use pagination
          insertResult.inserted
        );

        result.totalFetched += news.length;
        result.totalInserted += insertResult.inserted;
        result.sources.hola = {
          success: true,
          fetched: news.length,
          inserted: insertResult.inserted,
        };

        console.log(`Inserted ${insertResult.inserted} new news items from Hola.com`);
      } else {
        console.error("Hola.com fetch failed:", fetchResult.error);
        result.sources.hola = {
          success: false,
          error: fetchResult.error.message,
        };
        result.success = false;
      }
    } catch (error) {
      console.error("Hola.com ingest failed:", error);
      result.sources.hola = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      result.success = false;
    }
  }

  console.log(`News ingest completed: ${result.totalInserted} inserted, ${result.totalDeleted} deleted`);

  return result;
}
