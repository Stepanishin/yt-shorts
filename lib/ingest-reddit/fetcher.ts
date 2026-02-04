/**
 * Reddit API Fetcher
 * Uses public JSON endpoints (no OAuth required)
 */

import {
  RedditMeme,
  RedditSubreddit,
  RedditApiResponse,
  RedditApiPost,
} from "./types";
import {
  SubredditConfig,
  REDDIT_CONFIG,
  VALID_IMAGE_EXTENSIONS,
  VALID_IMAGE_DOMAINS,
} from "./config";

/**
 * Fetch posts from a subreddit
 */
export async function fetchSubreddit(
  config: SubredditConfig
): Promise<RedditApiPost[]> {
  const url = `${REDDIT_CONFIG.baseUrl}/r/${config.name}/${config.sort}.json?limit=${config.limit}&raw_json=1`;

  console.log(`[Reddit] Fetching ${config.name}/${config.sort}...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REDDIT_CONFIG.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": REDDIT_CONFIG.userAgent,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: RedditApiResponse = await response.json();

    console.log(`[Reddit] Fetched ${data.data.children.length} posts from r/${config.name}`);

    return data.data.children;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timeout fetching r/${config.name}`);
    }

    throw error;
  }
}

/**
 * Check if URL is a valid image
 */
function isValidImageUrl(url: string): boolean {
  if (!url) return false;

  try {
    const parsedUrl = new URL(url);

    // Check domain
    const isValidDomain = VALID_IMAGE_DOMAINS.some(
      (domain) =>
        parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
    );

    // Check extension
    const hasValidExtension = VALID_IMAGE_EXTENSIONS.some((ext) =>
      parsedUrl.pathname.toLowerCase().endsWith(ext)
    );

    return isValidDomain || hasValidExtension;
  } catch {
    return false;
  }
}

/**
 * Extract image URL from Reddit post
 */
function extractImageUrl(post: RedditApiPost["data"]): string | null {
  // Direct image URL
  if (isValidImageUrl(post.url)) {
    return post.url;
  }

  // Preview image
  if (post.preview?.images?.[0]?.source?.url) {
    const previewUrl = post.preview.images[0].source.url;
    // Reddit encodes URLs in preview, need to decode
    const decoded = previewUrl.replace(/&amp;/g, "&");
    if (isValidImageUrl(decoded) || decoded.includes("preview.redd.it")) {
      return decoded;
    }
  }

  // Imgur links without extension
  if (post.url?.includes("imgur.com") && !post.url.includes("/a/") && !post.url.includes("/gallery/")) {
    // Try adding .jpg extension
    const imgurUrl = post.url.replace(/\/$/, "") + ".jpg";
    return imgurUrl;
  }

  return null;
}

/**
 * Parse Reddit API post to RedditMeme
 */
export function parseRedditPost(
  post: RedditApiPost,
  subreddit: RedditSubreddit
): RedditMeme | null {
  const data = post.data;

  // Skip videos
  if (data.is_video) {
    return null;
  }

  // Skip galleries (multiple images)
  if (data.is_gallery) {
    return null;
  }

  // Skip non-image posts
  if (data.post_hint && data.post_hint !== "image") {
    return null;
  }

  // Extract image URL
  const imageUrl = extractImageUrl(data);
  if (!imageUrl) {
    return null;
  }

  return {
    source: "reddit",
    subreddit,
    title: data.title,
    imageUrl,
    redditUrl: `https://reddit.com${data.permalink}`,
    externalId: data.name, // "t3_xxxxx"
    author: data.author,
    score: data.score,
    upvoteRatio: data.upvote_ratio,
    numComments: data.num_comments,
    publishedDate: new Date(data.created_utc * 1000),
    isNsfw: data.over_18,
    flair: data.link_flair_text || undefined,
  };
}

/**
 * Filter memes by criteria
 */
export function filterMemes(
  memes: RedditMeme[],
  config: SubredditConfig
): RedditMeme[] {
  const now = Date.now();
  const maxAgeMs = config.maxAgeDays * 24 * 60 * 60 * 1000;

  return memes.filter((meme) => {
    // Skip NSFW content
    if (meme.isNsfw) {
      return false;
    }

    // Check minimum score
    if (meme.score < config.minScore) {
      return false;
    }

    // Check age
    const age = now - meme.publishedDate.getTime();
    if (age > maxAgeMs) {
      return false;
    }

    // Must have valid image
    if (!meme.imageUrl) {
      return false;
    }

    // Skip very short titles (likely spam)
    if (meme.title.length < 5) {
      return false;
    }

    return true;
  });
}

/**
 * Fetch and parse memes from a subreddit
 */
export async function fetchMemesFromSubreddit(
  config: SubredditConfig
): Promise<{ memes: RedditMeme[]; fetched: number; filtered: number }> {
  const posts = await fetchSubreddit(config);

  const parsed: RedditMeme[] = [];
  for (const post of posts) {
    const meme = parseRedditPost(post, config.name);
    if (meme) {
      parsed.push(meme);
    }
  }

  const filtered = filterMemes(parsed, config);

  console.log(
    `[Reddit] r/${config.name}: ${posts.length} posts -> ${parsed.length} images -> ${filtered.length} valid memes`
  );

  return {
    memes: filtered,
    fetched: posts.length,
    filtered: posts.length - filtered.length,
  };
}

/**
 * Delay helper for rate limiting
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
