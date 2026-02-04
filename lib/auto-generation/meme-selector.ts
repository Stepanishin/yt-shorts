/**
 * Meme Selector for Auto-Generation
 * Selects and reserves memes from reddit_memes collection
 */

import {
  reserveNextRedditMeme,
  getRedditMemesCount,
} from "@/lib/ingest-reddit/storage";
import { StoredRedditMeme } from "@/lib/ingest-reddit/types";

/**
 * Select and reserve the next available meme for video generation
 * Uses atomic findOneAndUpdate to prevent race conditions
 */
export async function selectNextMeme(): Promise<StoredRedditMeme | null> {
  const meme = await reserveNextRedditMeme();

  if (meme) {
    console.log(`[MemeSelector] Reserved meme: ${meme.title} (${meme.externalId})`);
  } else {
    console.log("[MemeSelector] No available memes found");
  }

  return meme;
}

/**
 * Get count of available memes for generation
 */
export async function getAvailableMemesCount(): Promise<number> {
  const count = await getRedditMemesCount("pending");
  console.log(`[MemeSelector] Available memes: ${count}`);
  return count;
}
