/**
 * Reddit Memes Storage (MongoDB)
 */

import { Collection, Document, ObjectId } from "mongodb";
import { getMongoDatabase } from "@/lib/db/mongodb";
import {
  RedditMeme,
  StoredRedditMeme,
  RedditMemeStatus,
  RedditSubreddit,
  RedditIngestState,
} from "./types";

const COLLECTION_NAME = "reddit_memes";
const INGEST_STATE_COLLECTION = "ingest_reddit_state";

/**
 * Get the reddit memes collection with indexes
 */
export const getRedditMemesCollection = async (): Promise<
  Collection<StoredRedditMeme & Document>
> => {
  const db = await getMongoDatabase();
  const collection = db.collection<StoredRedditMeme>(COLLECTION_NAME);
  await ensureIndexes(collection);
  return collection;
};

/**
 * Get the ingest state collection
 */
export const getIngestStateCollection = async (): Promise<
  Collection<RedditIngestState & Document>
> => {
  const db = await getMongoDatabase();
  const collection = db.collection<RedditIngestState>(INGEST_STATE_COLLECTION);
  await collection.createIndex({ subreddit: 1 }, { unique: true });
  return collection;
};

/**
 * Ensure indexes on the collection
 */
const ensureIndexes = async (collection: Collection<StoredRedditMeme>) => {
  await collection.createIndex({ externalId: 1 }, { unique: true });
  await collection.createIndex({ subreddit: 1 });
  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ score: -1 });
  await collection.createIndex({ publishedDate: -1 });
};

/**
 * Insert reddit memes, avoiding duplicates by externalId
 */
export const insertRedditMemes = async (
  memes: RedditMeme[]
): Promise<{ inserted: number; duplicates: number }> => {
  if (!memes.length) {
    return { inserted: 0, duplicates: 0 };
  }

  const collection = await getRedditMemesCollection();

  // Check for existing memes by externalId
  const externalIds = memes.map((m) => m.externalId);
  const existingMemes = await collection
    .find({ externalId: { $in: externalIds } })
    .project({ externalId: 1 })
    .toArray();

  const existingIds = new Set(existingMemes.map((m) => m.externalId));

  // Filter out duplicates
  const newMemes = memes.filter((m) => !existingIds.has(m.externalId));

  if (!newMemes.length) {
    return { inserted: 0, duplicates: memes.length };
  }

  // Prepare documents for insert
  const documents: StoredRedditMeme[] = newMemes.map((meme) => ({
    ...meme,
    status: "pending" as RedditMemeStatus,
    createdAt: new Date(),
  }));

  try {
    const result = await collection.insertMany(documents, { ordered: false });
    return {
      inserted: result.insertedCount,
      duplicates: memes.length - result.insertedCount,
    };
  } catch (error) {
    // Handle duplicate key errors gracefully
    if ((error as { code?: number }).code === 11000) {
      // Some inserts succeeded, some failed due to duplicates
      const inserted = (error as { result?: { nInserted?: number } }).result
        ?.nInserted || 0;
      return {
        inserted,
        duplicates: memes.length - inserted,
      };
    }
    throw error;
  }
};

/**
 * Find recent reddit memes
 */
export const findRecentRedditMemes = async (options: {
  limit?: number;
  status?: RedditMemeStatus | RedditMemeStatus[];
  subreddit?: RedditSubreddit;
}): Promise<StoredRedditMeme[]> => {
  const { limit = 50, status, subreddit } = options;

  const collection = await getRedditMemesCollection();

  const query: Record<string, unknown> = {};

  if (status) {
    if (Array.isArray(status)) {
      query.status = { $in: status };
    } else {
      query.status = status;
    }
  }

  if (subreddit) {
    query.subreddit = subreddit;
  }

  return collection.find(query).sort({ createdAt: -1 }).limit(limit).toArray();
};

/**
 * Find a reddit meme by ID
 */
export const findRedditMemeById = async (
  id: string | ObjectId
): Promise<StoredRedditMeme | null> => {
  const collection = await getRedditMemesCollection();
  const objectId = typeof id === "string" ? new ObjectId(id) : id;
  return collection.findOne({ _id: objectId });
};

/**
 * Reserve the next pending meme for video generation
 */
export const reserveNextRedditMeme = async (options?: {
  subreddit?: RedditSubreddit;
}): Promise<StoredRedditMeme | null> => {
  const collection = await getRedditMemesCollection();

  const query: Record<string, unknown> = {
    status: "pending",
  };

  if (options?.subreddit) {
    query.subreddit = options.subreddit;
  }

  const result = await collection.findOneAndUpdate(
    query,
    {
      $set: {
        status: "reserved",
        reservedAt: new Date(),
      },
    },
    {
      sort: { score: -1, createdAt: -1 }, // Prioritize high-score memes
      returnDocument: "after",
    }
  );

  return result;
};

/**
 * Update meme status
 */
export const markRedditMemeStatus = async (options: {
  id: string | ObjectId;
  status: RedditMemeStatus;
  notes?: string;
}): Promise<void> => {
  const { id, status, notes } = options;
  const collection = await getRedditMemesCollection();
  const objectId = typeof id === "string" ? new ObjectId(id) : id;

  const update: Record<string, unknown> = { status };

  if (status === "used") {
    update.usedAt = new Date();
  } else if (status === "deleted") {
    update.deletedAt = new Date();
  }

  if (notes !== undefined) {
    update.notes = notes;
  }

  await collection.updateOne({ _id: objectId }, { $set: update });
};

/**
 * Update user edits on a meme
 */
export const updateRedditMemeEdits = async (options: {
  id: string | ObjectId;
  editedTitle?: string;
  editedImageUrl?: string;
}): Promise<void> => {
  const { id, editedTitle, editedImageUrl } = options;
  const collection = await getRedditMemesCollection();
  const objectId = typeof id === "string" ? new ObjectId(id) : id;

  const update: Record<string, unknown> = {};

  if (editedTitle !== undefined) {
    update.editedTitle = editedTitle;
  }

  if (editedImageUrl !== undefined) {
    update.editedImageUrl = editedImageUrl;
  }

  if (Object.keys(update).length > 0) {
    await collection.updateOne({ _id: objectId }, { $set: update });
  }
};

/**
 * Mark a meme as published on YouTube
 */
export const markRedditMemeAsPublished = async (options: {
  id: string | ObjectId;
  youtubeVideoUrl: string;
  youtubeVideoId: string;
}): Promise<void> => {
  const { id, youtubeVideoUrl, youtubeVideoId } = options;
  const collection = await getRedditMemesCollection();
  const objectId = typeof id === "string" ? new ObjectId(id) : id;

  await collection.updateOne(
    { _id: objectId },
    {
      $set: {
        status: "used",
        usedAt: new Date(),
        youtubeVideoUrl,
        youtubeVideoId,
      },
    }
  );
};

/**
 * Delete old pending memes
 */
export const deleteOldPendingMemes = async (
  daysOld: number = 7
): Promise<number> => {
  const collection = await getRedditMemesCollection();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await collection.updateMany(
    {
      status: "pending",
      createdAt: { $lt: cutoffDate },
    },
    {
      $set: {
        status: "deleted",
        deletedAt: new Date(),
        notes: `Auto-deleted: older than ${daysOld} days`,
      },
    }
  );

  return result.modifiedCount;
};

/**
 * Get count of memes by status
 */
export const getRedditMemesCount = async (
  status?: RedditMemeStatus
): Promise<number> => {
  const collection = await getRedditMemesCollection();

  const query = status ? { status } : {};

  return collection.countDocuments(query);
};

/**
 * Update ingest state for a subreddit
 */
export const updateIngestState = async (
  subreddit: RedditSubreddit,
  fetchedCount: number
): Promise<void> => {
  const collection = await getIngestStateCollection();

  await collection.updateOne(
    { subreddit },
    {
      $set: {
        lastFetchedAt: new Date(),
      },
      $inc: {
        totalFetched: fetchedCount,
      },
    },
    { upsert: true }
  );
};

/**
 * Get ingest state for all subreddits
 */
export const getIngestStates = async (): Promise<RedditIngestState[]> => {
  const collection = await getIngestStateCollection();
  return collection.find({}).toArray();
};
