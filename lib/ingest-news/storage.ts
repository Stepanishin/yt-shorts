import { Collection, Document, ObjectId } from "mongodb";

import { getMongoDatabase } from "@/lib/db/mongodb";

import { NewsCandidate, NewsSource } from "./types";

const COLLECTION_NAME_ES = "news_candidates_es";
const INGEST_STATE_COLLECTION = "ingest_news_state";

export interface StoredNewsCandidate extends NewsCandidate {
  _id?: unknown;
  createdAt: Date;
  status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
  reservedAt?: Date;
  usedAt?: Date;
  deletedAt?: Date;
  publishedAt?: Date;
  notes?: string;

  // User edits
  editedTitle?: string;
  editedSummary?: string;
  editedImageUrl?: string;

  // YouTube metadata
  youtubeVideoUrl?: string;
  youtubeVideoId?: string;
}

export const getNewsCandidateCollection = async (): Promise<
  Collection<StoredNewsCandidate & Document>
> => {
  const db = await getMongoDatabase();
  const collection = db.collection<StoredNewsCandidate>(COLLECTION_NAME_ES);
  await ensureIndexes(collection);
  return collection;
};

const ensureIndexes = async (collection: Collection<StoredNewsCandidate>) => {
  await collection.createIndex({ source: 1, externalId: 1 }, { unique: false });
  await collection.createIndex({ source: 1, url: 1 }, { unique: false });
  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ publishedDate: -1 });
};

/**
 * Insert news candidates, avoiding duplicates
 */
export const insertNewsCandidates = async (news: NewsCandidate[]) => {
  if (!news.length) {
    return { inserted: 0 };
  }

  const collection = await getNewsCandidateCollection();

  // Check for existing news using externalId or URL
  const existingNews = await collection
    .find({
      $or: news.map((item) => {
        if (item.externalId) {
          return {
            source: item.source,
            externalId: item.externalId,
          };
        }
        return {
          source: item.source,
          url: item.url,
        };
      }),
    })
    .toArray();

  const existingKeys = new Set(
    existingNews.map((item) => {
      if (item.externalId) {
        return `${item.source}:${item.externalId}`;
      }
      return `${item.source}:url:${item.url}`;
    })
  );

  console.log(`Found ${existingKeys.size} existing news items (including deleted)`);
  console.log(`News with externalId: ${news.filter(n => n.externalId).length}, with URL only: ${news.filter(n => !n.externalId).length}`);

  // Filter only new news
  const newNews = news.filter((item) => {
    if (item.externalId) {
      return !existingKeys.has(`${item.source}:${item.externalId}`);
    }
    return !existingKeys.has(`${item.source}:url:${item.url}`);
  });

  console.log(`Inserting ${newNews.length} new news items out of ${news.length} total`);
  if (newNews.length < news.length) {
    console.log(`Filtered out ${news.length - newNews.length} duplicate news items`);
  }

  if (newNews.length === 0) {
    return { inserted: 0 };
  }

  // Create documents for insertion
  const documents = newNews.map<Omit<StoredNewsCandidate, "_id">>((item) => ({
    ...item,
    createdAt: new Date(),
    status: "pending" as const,
  }));

  const result = await collection.insertMany(documents, { ordered: false });
  console.log(`Inserted ${result.insertedCount} new news items`);

  return { inserted: result.insertedCount };
};

/**
 * Find recent news candidates
 */
export const findRecentNewsCandidates = async ({
  limit = 50,
}: {
  limit?: number;
}) => {
  const collection = await getNewsCandidateCollection();
  // Show only pending and reserved, exclude used, rejected and deleted
  const cursor = collection.find(
    {
      status: { $in: ["pending", "reserved", undefined] }
    },
    { sort: { createdAt: -1 }, limit }
  );
  return cursor.toArray();
};

/**
 * Find news candidate by ID
 */
export const findNewsCandidateById = async (id: unknown) => {
  const collection = await getNewsCandidateCollection();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  return collection.findOne({ _id: objectId as ObjectId });
};

/**
 * Reserve next news candidate for generation
 */
export const reserveNextNewsCandidate = async ({
  language = "es",
  sources,
}: {
  language?: string;
  sources?: NewsCandidate["source"][];
}) => {
  const collection = await getNewsCandidateCollection();

  const query: Record<string, unknown> = {
    status: { $in: [undefined, "pending"] },
  };

  if (language) {
    query.language = language;
  }

  if (sources && sources.length > 0) {
    query.source = { $in: sources };
  }

  console.log("🔍 reserveNextNewsCandidate query:", JSON.stringify(query, null, 2));

  // First, let's check if any documents match before trying to update
  const matchingDocs = await collection.find(query).limit(5).toArray();
  console.log(`📊 Found ${matchingDocs.length} matching documents BEFORE update`);
  if (matchingDocs.length > 0) {
    console.log("First matching doc:", {
      id: matchingDocs[0]._id,
      source: matchingDocs[0].source,
      language: matchingDocs[0].language,
      status: matchingDocs[0].status,
      title: matchingDocs[0].title?.substring(0, 50),
    });
  }

  const update = {
    $set: {
      status: "reserved" as const,
      reservedAt: new Date(),
    },
  };

  const result = await collection.findOneAndUpdate(query, update, {
    sort: { publishedDate: -1, createdAt: -1 }, // Prefer newer news
    returnDocument: "after",
  });

  console.log("✅ findOneAndUpdate result:", result ? "Found and updated" : "NOT FOUND");
  console.log("📦 Result structure:", {
    hasResult: !!result,
    resultKeys: result ? Object.keys(result) : [],
    hasValue: result?.value !== undefined,
    value: result?.value ? "EXISTS" : "UNDEFINED",
  });

  // Handle different MongoDB driver versions
  const news = result?.value || (result as any) || result;

  if (!news || !news._id) {
    console.warn("No news document returned from findOneAndUpdate");
    return undefined;
  }

  console.log(`✅ Reserved news: ${news._id} - "${news.title?.substring(0, 50)}..."`);

  return news;
};

/**
 * Mark news candidate status
 */
export const markNewsCandidateStatus = async ({
  id,
  status,
  notes,
}: {
  id: unknown;
  status: "used" | "rejected" | "pending" | "reserved" | "deleted";
  notes?: string;
}) => {
  const collection = await getNewsCandidateCollection();

  const update: Record<string, unknown> = {
    status,
    notes,
  };

  if (status === "used") {
    update.usedAt = new Date();
    update.reservedAt = update.reservedAt ?? new Date();
  }

  if (status === "pending") {
    update.reservedAt = undefined;
  }

  if (status === "reserved") {
    update.reservedAt = new Date();
  }

  if (status === "deleted") {
    update.deletedAt = new Date();
  }

  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });
};

/**
 * Mark news candidate as published to YouTube
 */
export const markNewsCandidateAsPublished = async ({
  id,
  youtubeVideoUrl,
  youtubeVideoId,
}: {
  id: unknown;
  youtubeVideoUrl: string;
  youtubeVideoId: string;
}) => {
  const collection = await getNewsCandidateCollection();

  const update = {
    status: "used" as const,
    usedAt: new Date(),
    publishedAt: new Date(),
    youtubeVideoUrl,
    youtubeVideoId,
  };

  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;

  console.log(`Marking news ${id} (ObjectId: ${objectId}) as published`);

  const result = await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });

  if (result.matchedCount === 0) {
    throw new Error(`News with id ${id} not found in database`);
  }

  if (result.modifiedCount === 0) {
    console.warn(`News ${id} was found but not modified (might already be marked as used)`);
  } else {
    console.log(`Successfully marked news ${id} as used and published`);
  }

  return result;
};

/**
 * Delete news candidate (soft delete)
 */
export const deleteNewsCandidate = async (id: unknown) => {
  console.log(`Deleting news candidate ${id}`);
  await markNewsCandidateStatus({ id, status: "deleted", notes: "Deleted by user" });
  console.log(`News candidate ${id} marked as deleted`);
};

/**
 * Update news candidate edits
 */
export const updateNewsCandidateEdits = async ({
  id,
  editedTitle,
  editedSummary,
  editedImageUrl,
}: {
  id: unknown;
  editedTitle?: string;
  editedSummary?: string;
  editedImageUrl?: string;
}) => {
  const collection = await getNewsCandidateCollection();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;

  const updates: Record<string, unknown> = {};
  if (editedTitle !== undefined) updates.editedTitle = editedTitle;
  if (editedSummary !== undefined) updates.editedSummary = editedSummary;
  if (editedImageUrl !== undefined) updates.editedImageUrl = editedImageUrl;

  await collection.updateOne(
    { _id: objectId as ObjectId },
    { $set: updates }
  );

  console.log(`Updated edits for news ${id}`);
};

/**
 * Delete old pending news (older than specified days)
 */
export const deleteOldPendingNews = async (daysOld: number = 3) => {
  const collection = await getNewsCandidateCollection();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await collection.updateMany(
    {
      status: "pending",
      createdAt: { $lt: cutoffDate }
    },
    {
      $set: {
        status: "deleted",
        deletedAt: new Date(),
        notes: `Auto-deleted: older than ${daysOld} days`
      }
    }
  );

  console.log(`Deleted ${result.modifiedCount} old pending news items (older than ${daysOld} days)`);
  return result.modifiedCount;
};

// ============ Ingest State Management ============

export interface IngestNewsState {
  source: NewsSource;
  sourceKey: string; // e.g., "diezminutos:famosos"
  lastPage: number;
  lastFetchedAt: Date;
  totalFetched: number;
}

const getIngestStateCollection = async (): Promise<Collection<IngestNewsState & Document>> => {
  const db = await getMongoDatabase();
  const collection = db.collection<IngestNewsState>(INGEST_STATE_COLLECTION);
  await collection.createIndex({ source: 1, sourceKey: 1 }, { unique: true });
  return collection;
};

export const getNextPageForSource = async (
  source: NewsSource,
  sourceKey: string
): Promise<number> => {
  const collection = await getIngestStateCollection();
  const state = await collection.findOne({ source, sourceKey });

  if (!state) {
    return 1; // First page
  }

  return state.lastPage + 1;
};

export const updateSourceState = async (
  source: NewsSource,
  sourceKey: string,
  page: number,
  fetchedCount: number
) => {
  const collection = await getIngestStateCollection();

  await collection.updateOne(
    { source, sourceKey },
    {
      $set: {
        lastPage: page,
        lastFetchedAt: new Date(),
      },
      $inc: {
        totalFetched: fetchedCount,
      },
      $setOnInsert: {
        source,
        sourceKey,
      },
    },
    { upsert: true }
  );

  console.log(`Updated state for ${source}:${sourceKey} - page ${page}, fetched ${fetchedCount}`);
};
