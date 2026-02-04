/**
 * Reddit Memes Ingest Configuration
 */

import { RedditSubreddit } from "./types";

export interface SubredditConfig {
  name: RedditSubreddit;
  enabled: boolean;
  sort: "hot" | "new" | "top" | "rising";
  limit: number;
  minScore: number;
  maxAgeDays: number;
}

/**
 * List of Spanish subreddits to scrape for memes
 */
export const SUBREDDITS: SubredditConfig[] = [
  {
    name: "spain",
    enabled: true,
    sort: "hot",
    limit: 50,
    minScore: 50, // Lower threshold for smaller subreddit
    maxAgeDays: 7,
  },
  {
    name: "es",
    enabled: true,
    sort: "hot",
    limit: 50,
    minScore: 50,
    maxAgeDays: 7,
  },
  {
    name: "SpanishMeme",
    enabled: true,
    sort: "hot",
    limit: 50,
    minScore: 20, // Very small subreddit, low threshold
    maxAgeDays: 14,
  },
  {
    name: "yo_elvr",
    enabled: true,
    sort: "hot",
    limit: 50,
    minScore: 100, // More active subreddit
    maxAgeDays: 7,
  },
];

/**
 * Reddit API configuration
 */
export const REDDIT_CONFIG = {
  baseUrl: "https://www.reddit.com",
  userAgent: "ShortsGenerator/1.0 (by /u/shorts-generator-bot)",
  timeoutMs: 15000,
  requestDelayMs: 2000, // Delay between requests to avoid rate limiting
};

/**
 * Image extensions that are considered valid
 */
export const VALID_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * Domains that host Reddit images
 */
export const VALID_IMAGE_DOMAINS = [
  "i.redd.it",
  "i.imgur.com",
  "imgur.com",
  "preview.redd.it",
];

/**
 * Get enabled subreddits
 */
export function getEnabledSubreddits(): SubredditConfig[] {
  return SUBREDDITS.filter((s) => s.enabled);
}
