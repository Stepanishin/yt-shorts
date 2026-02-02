import { fetchCarasNews } from "./scrapers/caras";
import { fetchFlashNews } from "./scrapers/flash";
import { fetchNoticiasAoMinutoNews } from "./scrapers/noticiasaominuto";
import { fetchGoogleNewsPT } from "./scrapers/googlenews-pt";
import {
  insertNewsCandidatesPT,
  deleteOldPendingNewsPT,
  updateSourceStatePT,
} from "./storage-pt";
import { DEFAULT_NEWS_INGEST_CONFIG_PT } from "./config";
import { NewsCandidate } from "./types";

export interface RunNewsIngestOptionsPT {
  sources?: {
    caras?: boolean;
    flash?: boolean;
    noticiasaominuto?: boolean;
    googlenews?: boolean;
  };
}

export interface RunNewsIngestResultPT {
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
 * Run Portuguese news ingest process
 * Fetches news from configured Portuguese sources and stores in database
 */
export async function runNewsIngestPT(
  options: RunNewsIngestOptionsPT = {}
): Promise<RunNewsIngestResultPT> {
  const result: RunNewsIngestResultPT = {
    success: true,
    totalFetched: 0,
    totalInserted: 0,
    totalDeleted: 0,
    sources: {},
  };

  console.log("Starting Portuguese news ingest process...");

  // Delete old pending news first (older than 3 days)
  try {
    const deletedCount = await deleteOldPendingNewsPT(3);
    result.totalDeleted = deletedCount;
    console.log(`Deleted ${deletedCount} old pending Portuguese news items`);
  } catch (error) {
    console.error("Failed to delete old pending Portuguese news:", error);
  }

  // Fetch from Caras.pt
  if (options.sources?.caras !== false && DEFAULT_NEWS_INGEST_CONFIG_PT.caras.enabled) {
    try {
      const config = DEFAULT_NEWS_INGEST_CONFIG_PT.caras;

      console.log(`Fetching news from Caras.pt...`);

      const fetchResult = await fetchCarasNews({
        feedUrls: config.feedUrls,
        timeoutMs: config.timeoutMs,
      });

      if (fetchResult.ok) {
        const news = fetchResult.news;
        console.log(`Fetched ${news.length} celebrity news items from Caras.pt (${fetchResult.meta.totalFound} total)`);

        // Insert into database
        const insertResult = await insertNewsCandidatesPT(news);

        // Update source state
        await updateSourceStatePT(
          "caras",
          "gente",
          1, // RSS feeds don't use pagination
          insertResult.inserted
        );

        result.totalFetched += news.length;
        result.totalInserted += insertResult.inserted;
        result.sources.caras = {
          success: true,
          fetched: news.length,
          inserted: insertResult.inserted,
        };

        console.log(`Inserted ${insertResult.inserted} new news items from Caras.pt`);
      } else {
        console.error("Caras.pt fetch failed:", fetchResult.error);
        result.sources.caras = {
          success: false,
          error: fetchResult.error.message,
        };
        result.success = false;
      }
    } catch (error) {
      console.error("Caras.pt ingest failed:", error);
      result.sources.caras = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      result.success = false;
    }
  }

  // Fetch from Flash.pt
  if (options.sources?.flash !== false && DEFAULT_NEWS_INGEST_CONFIG_PT.flash.enabled) {
    try {
      const config = DEFAULT_NEWS_INGEST_CONFIG_PT.flash;

      console.log(`Fetching news from Flash.pt...`);

      const fetchResult = await fetchFlashNews({
        feedUrl: config.feedUrl,
        timeoutMs: config.timeoutMs,
      });

      if (fetchResult.ok) {
        const news = fetchResult.news;
        console.log(`Fetched ${news.length} celebrity news items from Flash.pt (${fetchResult.meta.totalFound} total)`);

        // Insert into database
        const insertResult = await insertNewsCandidatesPT(news);

        // Update source state
        await updateSourceStatePT(
          "flash",
          "gente",
          1, // RSS feeds don't use pagination
          insertResult.inserted
        );

        result.totalFetched += news.length;
        result.totalInserted += insertResult.inserted;
        result.sources.flash = {
          success: true,
          fetched: news.length,
          inserted: insertResult.inserted,
        };

        console.log(`Inserted ${insertResult.inserted} new news items from Flash.pt`);
      } else {
        console.error("Flash.pt fetch failed:", fetchResult.error);
        result.sources.flash = {
          success: false,
          error: fetchResult.error.message,
        };
        // Don't mark as failed if other sources work
      }
    } catch (error) {
      console.error("Flash.pt ingest failed:", error);
      result.sources.flash = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      // Don't mark as failed if other sources work
    }
  }

  // Fetch from Notícias ao Minuto
  if (options.sources?.noticiasaominuto !== false && DEFAULT_NEWS_INGEST_CONFIG_PT.noticiasaominuto.enabled) {
    try {
      const config = DEFAULT_NEWS_INGEST_CONFIG_PT.noticiasaominuto;

      console.log(`Fetching news from Notícias ao Minuto...`);

      const fetchResult = await fetchNoticiasAoMinutoNews({
        feedUrls: config.feedUrls,
        timeoutMs: config.timeoutMs,
      });

      if (fetchResult.ok) {
        const news = fetchResult.news;
        console.log(`Fetched ${news.length} lifestyle/celebrity news items from Notícias ao Minuto (${fetchResult.meta.totalFound} total)`);

        // Insert into database
        const insertResult = await insertNewsCandidatesPT(news);

        // Update source state
        await updateSourceStatePT(
          "noticiasaominuto",
          "lifestyle",
          1, // RSS feeds don't use pagination
          insertResult.inserted
        );

        result.totalFetched += news.length;
        result.totalInserted += insertResult.inserted;
        result.sources.noticiasaominuto = {
          success: true,
          fetched: news.length,
          inserted: insertResult.inserted,
        };

        console.log(`Inserted ${insertResult.inserted} new news items from Notícias ao Minuto`);
      } else {
        console.error("Notícias ao Minuto fetch failed:", fetchResult.error);
        result.sources.noticiasaominuto = {
          success: false,
          error: fetchResult.error.message,
        };
        // Don't mark as failed if other sources work
      }
    } catch (error) {
      console.error("Notícias ao Minuto ingest failed:", error);
      result.sources.noticiasaominuto = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      // Don't mark as failed if other sources work
    }
  }

  // Fetch from Google News Portugal
  if (options.sources?.googlenews !== false && DEFAULT_NEWS_INGEST_CONFIG_PT.googlenews.enabled) {
    try {
      const config = DEFAULT_NEWS_INGEST_CONFIG_PT.googlenews;

      console.log(`Fetching news from Google News Portugal...`);

      const fetchResult = await fetchGoogleNewsPT({
        feedUrls: config.feedUrls,
        timeoutMs: config.timeoutMs,
      });

      if (fetchResult.ok) {
        const news = fetchResult.news;
        console.log(`Fetched ${news.length} news items from Google News PT (${fetchResult.meta.totalFound} total)`);

        // Insert into database
        const insertResult = await insertNewsCandidatesPT(news);

        // Update source state
        await updateSourceStatePT(
          "googlenews",
          "celebridades",
          1, // RSS feeds don't use pagination
          insertResult.inserted
        );

        result.totalFetched += news.length;
        result.totalInserted += insertResult.inserted;
        result.sources.googlenews = {
          success: true,
          fetched: news.length,
          inserted: insertResult.inserted,
        };

        console.log(`Inserted ${insertResult.inserted} new news items from Google News PT`);
      } else {
        console.error("Google News PT fetch failed:", fetchResult.error);
        result.sources.googlenews = {
          success: false,
          error: fetchResult.error.message,
        };
        // Don't mark as failed if other sources work
      }
    } catch (error) {
      console.error("Google News PT ingest failed:", error);
      result.sources.googlenews = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      // Don't mark as failed if other sources work
    }
  }

  console.log(`Portuguese news ingest completed: ${result.totalInserted} inserted, ${result.totalDeleted} deleted`);

  return result;
}
