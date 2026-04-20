import { fetch24urNews } from "./scrapers/24ur";
import { fetchRtvsloNews } from "./scrapers/rtvslo";
import { fetchGovoriseNews } from "./scrapers/govorise";
import {
  insertNewsCandidatesSL,
  deleteOldPendingNewsSL,
  updateSourceStateSL,
} from "./storage-sl";
import { DEFAULT_NEWS_INGEST_CONFIG_SL } from "./config";

export interface RunNewsIngestOptionsSL {
  sources?: {
    "24ur"?: boolean;
    rtvslo?: boolean;
    govorise?: boolean;
  };
}

export interface RunNewsIngestResultSL {
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

export async function runNewsIngestSL(
  options: RunNewsIngestOptionsSL = {}
): Promise<RunNewsIngestResultSL> {
  const result: RunNewsIngestResultSL = {
    success: true,
    totalFetched: 0,
    totalInserted: 0,
    totalDeleted: 0,
    sources: {},
  };

  console.log("Starting Slovenian news ingest process...");

  try {
    const deletedCount = await deleteOldPendingNewsSL(3);
    result.totalDeleted = deletedCount;
    console.log(`Deleted ${deletedCount} old pending Slovenian news items`);
  } catch (error) {
    console.error("Failed to delete old pending Slovenian news:", error);
  }

  // Fetch from 24ur
  if (options.sources?.["24ur"] !== false && DEFAULT_NEWS_INGEST_CONFIG_SL["24ur"].enabled) {
    try {
      const config = DEFAULT_NEWS_INGEST_CONFIG_SL["24ur"];

      console.log("Fetching news from 24ur.com...");

      const fetchResult = await fetch24urNews({
        feedUrls: config.feedUrls,
        timeoutMs: config.timeoutMs,
      });

      if (fetchResult.ok) {
        const news = fetchResult.news;
        console.log(
          `Fetched ${news.length} news items from 24ur (${fetchResult.meta.totalFound} total)`
        );

        const insertResult = await insertNewsCandidatesSL(news);

        await updateSourceStateSL(
          "24ur",
          "general",
          1,
          insertResult.inserted
        );

        result.totalFetched += news.length;
        result.totalInserted += insertResult.inserted;
        result.sources["24ur"] = {
          success: true,
          fetched: news.length,
          inserted: insertResult.inserted,
        };

        console.log(
          `Inserted ${insertResult.inserted} new news items from 24ur`
        );
      } else {
        console.error("24ur fetch failed:", fetchResult.error);
        result.sources["24ur"] = {
          success: false,
          error: fetchResult.error.message,
        };
        result.success = false;
      }
    } catch (error) {
      console.error("24ur ingest failed:", error);
      result.sources["24ur"] = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      result.success = false;
    }
  }

  // Fetch from RTVSLO
  if (options.sources?.rtvslo !== false && DEFAULT_NEWS_INGEST_CONFIG_SL.rtvslo.enabled) {
    try {
      const config = DEFAULT_NEWS_INGEST_CONFIG_SL.rtvslo;

      console.log("Fetching news from rtvslo.si...");

      const fetchResult = await fetchRtvsloNews({
        feedUrls: config.feedUrls,
        timeoutMs: config.timeoutMs,
      });

      if (fetchResult.ok) {
        const news = fetchResult.news;
        console.log(
          `Fetched ${news.length} news items from RTVSLO (${fetchResult.meta.totalFound} total)`
        );

        const insertResult = await insertNewsCandidatesSL(news);

        await updateSourceStateSL(
          "rtvslo",
          "general",
          1,
          insertResult.inserted
        );

        result.totalFetched += news.length;
        result.totalInserted += insertResult.inserted;
        result.sources.rtvslo = {
          success: true,
          fetched: news.length,
          inserted: insertResult.inserted,
        };

        console.log(
          `Inserted ${insertResult.inserted} new news items from RTVSLO`
        );
      } else {
        console.error("RTVSLO fetch failed:", fetchResult.error);
        result.sources.rtvslo = {
          success: false,
          error: fetchResult.error.message,
        };
        result.success = false;
      }
    } catch (error) {
      console.error("RTVSLO ingest failed:", error);
      result.sources.rtvslo = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      result.success = false;
    }
  }

  // Fetch from Govori.se (celebrity gossip)
  if (options.sources?.govorise !== false && DEFAULT_NEWS_INGEST_CONFIG_SL.govorise.enabled) {
    try {
      const config = DEFAULT_NEWS_INGEST_CONFIG_SL.govorise;

      console.log("Fetching news from Govori.se...");

      const fetchResult = await fetchGovoriseNews({
        feedUrls: config.feedUrls,
        timeoutMs: config.timeoutMs,
      });

      if (fetchResult.ok) {
        const news = fetchResult.news;
        console.log(
          `Fetched ${news.length} news items from Govori.se (${fetchResult.meta.totalFound} total)`
        );

        const insertResult = await insertNewsCandidatesSL(news);

        await updateSourceStateSL(
          "govorise",
          "general",
          1,
          insertResult.inserted
        );

        result.totalFetched += news.length;
        result.totalInserted += insertResult.inserted;
        result.sources.govorise = {
          success: true,
          fetched: news.length,
          inserted: insertResult.inserted,
        };

        console.log(
          `Inserted ${insertResult.inserted} new news items from Govori.se`
        );
      } else {
        console.error("Govori.se fetch failed:", fetchResult.error);
        result.sources.govorise = {
          success: false,
          error: fetchResult.error.message,
        };
        result.success = false;
      }
    } catch (error) {
      console.error("Govori.se ingest failed:", error);
      result.sources.govorise = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      result.success = false;
    }
  }

  console.log(
    `Slovenian news ingest completed: ${result.totalInserted} inserted, ${result.totalDeleted} deleted`
  );

  return result;
}
