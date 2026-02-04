/**
 * Reddit Memes Ingest Orchestrator
 */

import { RedditIngestResult, RedditIngestSummary } from "./types";
import { getEnabledSubreddits, REDDIT_CONFIG } from "./config";
import { fetchMemesFromSubreddit, delay } from "./fetcher";
import {
  insertRedditMemes,
  updateIngestState,
  deleteOldPendingMemes,
} from "./storage";

/**
 * Run the full Reddit memes ingest process
 */
export async function runRedditIngest(): Promise<RedditIngestSummary> {
  const startedAt = new Date();

  console.log("\n" + "=".repeat(60));
  console.log("🎭 REDDIT MEMES INGEST STARTED");
  console.log("=".repeat(60));

  const subreddits = getEnabledSubreddits();
  console.log(`Found ${subreddits.length} enabled subreddits`);

  const results: RedditIngestResult[] = [];
  let totalFetched = 0;
  let totalInserted = 0;
  let totalDuplicates = 0;
  let totalFiltered = 0;

  for (const config of subreddits) {
    console.log(`\n--- Processing r/${config.name} ---`);

    const result: RedditIngestResult = {
      subreddit: config.name,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      filtered: 0,
      errors: [],
    };

    try {
      // Fetch memes from subreddit
      const { memes, fetched, filtered } = await fetchMemesFromSubreddit(config);

      result.fetched = fetched;
      result.filtered = filtered;

      if (memes.length === 0) {
        console.log(`[Reddit] No valid memes found in r/${config.name}`);
        results.push(result);
        continue;
      }

      // Insert into database
      const { inserted, duplicates } = await insertRedditMemes(memes);

      result.inserted = inserted;
      result.duplicates = duplicates;

      // Update state
      await updateIngestState(config.name, fetched);

      console.log(
        `[Reddit] r/${config.name}: Inserted ${inserted}, Duplicates ${duplicates}`
      );

      // Update totals
      totalFetched += fetched;
      totalInserted += inserted;
      totalDuplicates += duplicates;
      totalFiltered += filtered;

      results.push(result);

      // Delay between requests to avoid rate limiting
      if (subreddits.indexOf(config) < subreddits.length - 1) {
        console.log(
          `[Reddit] Waiting ${REDDIT_CONFIG.requestDelayMs}ms before next request...`
        );
        await delay(REDDIT_CONFIG.requestDelayMs);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[Reddit] Error processing r/${config.name}:`, errorMessage);
      result.errors.push(errorMessage);
      results.push(result);
    }
  }

  // Cleanup old pending memes
  console.log("\n--- Cleanup ---");
  try {
    const deleted = await deleteOldPendingMemes(7);
    console.log(`[Reddit] Deleted ${deleted} old pending memes`);
  } catch (error) {
    console.error("[Reddit] Error during cleanup:", error);
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  console.log("\n" + "=".repeat(60));
  console.log("🎭 REDDIT MEMES INGEST COMPLETED");
  console.log(`Total fetched: ${totalFetched}`);
  console.log(`Total inserted: ${totalInserted}`);
  console.log(`Total duplicates: ${totalDuplicates}`);
  console.log(`Total filtered: ${totalFiltered}`);
  console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);
  console.log("=".repeat(60) + "\n");

  return {
    totalFetched,
    totalInserted,
    totalDuplicates,
    totalFiltered,
    results,
    startedAt,
    completedAt,
  };
}

/**
 * Export for scheduler
 */
export { runRedditIngest as default };
