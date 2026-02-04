/**
 * Reddit Memes Ingest Types
 */

import { ObjectId } from "mongodb";

export type RedditSubreddit = "spain" | "es" | "SpanishMeme" | "yo_elvr";

export type RedditMemeStatus = "pending" | "reserved" | "used" | "rejected" | "deleted";

/**
 * Raw Reddit meme data from API
 */
export interface RedditMeme {
  source: "reddit";
  subreddit: RedditSubreddit;
  title: string;
  imageUrl: string;
  redditUrl: string;
  externalId: string; // Reddit post ID (e.g., "t3_xxxxx")
  author: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  publishedDate: Date;
  isNsfw: boolean;
  flair?: string;
}

/**
 * Stored Reddit meme with MongoDB fields
 */
export interface StoredRedditMeme extends RedditMeme {
  _id?: ObjectId;
  status: RedditMemeStatus;
  createdAt: Date;
  reservedAt?: Date;
  usedAt?: Date;
  deletedAt?: Date;
  notes?: string;

  // User edits
  editedTitle?: string;
  editedImageUrl?: string;

  // YouTube metadata (if used for video)
  youtubeVideoUrl?: string;
  youtubeVideoId?: string;
}

/**
 * Reddit ingest state for tracking last fetch
 */
export interface RedditIngestState {
  subreddit: RedditSubreddit;
  lastFetchedAt: Date;
  totalFetched: number;
}

/**
 * Reddit API response types
 */
export interface RedditApiPost {
  kind: "t3";
  data: {
    id: string;
    name: string; // "t3_xxxxx"
    title: string;
    author: string;
    subreddit: string;
    subreddit_name_prefixed: string;
    url: string;
    permalink: string;
    score: number;
    upvote_ratio: number;
    num_comments: number;
    created_utc: number;
    over_18: boolean;
    is_video: boolean;
    is_gallery?: boolean;
    post_hint?: string; // "image", "link", "hosted:video", etc.
    link_flair_text?: string;
    preview?: {
      images: Array<{
        source: {
          url: string;
          width: number;
          height: number;
        };
        resolutions: Array<{
          url: string;
          width: number;
          height: number;
        }>;
      }>;
    };
    thumbnail?: string;
    thumbnail_width?: number;
    thumbnail_height?: number;
  };
}

export interface RedditApiResponse {
  kind: "Listing";
  data: {
    after: string | null;
    before: string | null;
    children: RedditApiPost[];
    dist: number;
  };
}

/**
 * Ingest result statistics
 */
export interface RedditIngestResult {
  subreddit: RedditSubreddit;
  fetched: number;
  inserted: number;
  duplicates: number;
  filtered: number;
  errors: string[];
}

export interface RedditIngestSummary {
  totalFetched: number;
  totalInserted: number;
  totalDuplicates: number;
  totalFiltered: number;
  results: RedditIngestResult[];
  startedAt: Date;
  completedAt: Date;
}
