import { fetchPageSixNews } from "./scrapers/pagesix";
import {
  insertNewsCandidatesEN,
  deleteOldPendingNewsEN,
  updateSourceStateEN,
} from "./storage-en";
import { DEFAULT_NEWS_INGEST_CONFIG_EN } from "./config";

export interface RunNewsIngestOptionsEN {
  sources?: {
    pagesix?: boolean;
  };
}

export interface RunNewsIngestResultEN {
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

export async function runNewsIngestEN(
  options: RunNewsIngestOptionsEN = {}
): Promise<RunNewsIngestResultEN> {
  const result: RunNewsIngestResultEN = {
    success: true,
    totalFetched: 0,
    totalInserted: 0,
    totalDeleted: 0,
    sources: {},
  };

  console.log("Starting English news ingest process...");

  try {
    const deletedCount = await deleteOldPendingNewsEN(3);
    result.totalDeleted = deletedCount;
    console.log(`Deleted ${deletedCount} old pending English news items`);
  } catch (error) {
    console.error("Failed to delete old pending English news:", error);
  }

  // Fetch from Page Six
  if (options.sources?.pagesix !== false && DEFAULT_NEWS_INGEST_CONFIG_EN.pagesix.enabled) {
    try {
      const config = DEFAULT_NEWS_INGEST_CONFIG_EN.pagesix;

      console.log("Fetching news from Page Six...");

      const fetchResult = await fetchPageSixNews({
        feedUrls: config.feedUrls,
        timeoutMs: config.timeoutMs,
      });

      if (fetchResult.ok) {
        const news = fetchResult.news;
        console.log(
          `Fetched ${news.length} news items from Page Six (${fetchResult.meta.totalFound} total)`
        );

        const insertResult = await insertNewsCandidatesEN(news);

        await updateSourceStateEN(
          "pagesix",
          "general",
          1,
          insertResult.inserted
        );

        result.totalFetched += news.length;
        result.totalInserted += insertResult.inserted;
        result.sources.pagesix = {
          success: true,
          fetched: news.length,
          inserted: insertResult.inserted,
        };

        console.log(
          `Inserted ${insertResult.inserted} new news items from Page Six`
        );
      } else {
        console.error("Page Six fetch failed:", fetchResult.error);
        result.sources.pagesix = {
          success: false,
          error: fetchResult.error.message,
        };
        result.success = false;
      }
    } catch (error) {
      console.error("Page Six ingest failed:", error);
      result.sources.pagesix = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      result.success = false;
    }
  }

  console.log(
    `English news ingest completed: ${result.totalInserted} inserted, ${result.totalDeleted} deleted`
  );

  return result;
}
