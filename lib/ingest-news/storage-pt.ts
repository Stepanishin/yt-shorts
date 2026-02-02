import { Collection, Document, ObjectId } from "mongodb";

import { getMongoDatabase } from "@/lib/db/mongodb";

import { NewsCandidate, NewsSource } from "./types";

const COLLECTION_NAME_PT = "news_candidates_pt";
const INGEST_STATE_COLLECTION_PT = "ingest_news_state_pt";

export interface StoredNewsCandidatePT extends NewsCandidate {
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

export const getNewsCandidateCollectionPT = async (): Promise<
  Collection<StoredNewsCandidatePT & Document>
> => {
  const db = await getMongoDatabase();
  const collection = db.collection<StoredNewsCandidatePT>(COLLECTION_NAME_PT);
  await ensureIndexes(collection);
  return collection;
};

const ensureIndexes = async (collection: Collection<StoredNewsCandidatePT>) => {
  await collection.createIndex({ source: 1, externalId: 1 }, { unique: false });
  await collection.createIndex({ source: 1, url: 1 }, { unique: false });
  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ publishedDate: -1 });
};

/**
 * Insert Portuguese news candidates, avoiding duplicates
 */
export const insertNewsCandidatesPT = async (news: NewsCandidate[]) => {
  if (!news.length) {
    return { inserted: 0 };
  }

  const collection = await getNewsCandidateCollectionPT();

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

  console.log(`Found ${existingKeys.size} existing Portuguese news items (including deleted)`);
  console.log(`News with externalId: ${news.filter(n => n.externalId).length}, with URL only: ${news.filter(n => !n.externalId).length}`);

  // Filter only new news
  const newNews = news.filter((item) => {
    if (item.externalId) {
      return !existingKeys.has(`${item.source}:${item.externalId}`);
    }
    return !existingKeys.has(`${item.source}:url:${item.url}`);
  });

  console.log(`Inserting ${newNews.length} new Portuguese news items out of ${news.length} total`);
  if (newNews.length < news.length) {
    console.log(`Filtered out ${news.length - newNews.length} duplicate Portuguese news items`);
  }

  if (newNews.length === 0) {
    return { inserted: 0 };
  }

  // Create documents for insertion
  const documents = newNews.map<Omit<StoredNewsCandidatePT, "_id">>((item) => ({
    ...item,
    createdAt: new Date(),
    status: "pending" as const,
  }));

  const result = await collection.insertMany(documents, { ordered: false });
  console.log(`Inserted ${result.insertedCount} new Portuguese news items`);

  return { inserted: result.insertedCount };
};

/**
 * Find recent Portuguese news candidates
 */
export const findRecentNewsCandidatesPT = async ({
  limit = 50,
}: {
  limit?: number;
}) => {
  const collection = await getNewsCandidateCollectionPT();
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
 * Find Portuguese news candidate by ID
 */
export const findNewsCandidateByIdPT = async (id: unknown) => {
  const collection = await getNewsCandidateCollectionPT();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  return collection.findOne({ _id: objectId as ObjectId });
};

/**
 * Reserve next Portuguese news candidate for generation
 */
export const reserveNextNewsCandidatePT = async ({
  language = "pt",
  sources,
}: {
  language?: string;
  sources?: NewsCandidate["source"][];
}) => {
  const collection = await getNewsCandidateCollectionPT();

  const query: Record<string, unknown> = {
    status: { $in: [undefined, "pending"] },
  };

  if (language) {
    query.language = language;
  }

  if (sources && sources.length > 0) {
    query.source = { $in: sources };
  }

  console.log("🔍 reserveNextNewsCandidatePT query:", JSON.stringify(query, null, 2));

  // First, let's check if any documents match before trying to update
  const matchingDocs = await collection.find(query).limit(5).toArray();
  console.log(`📊 Found ${matchingDocs.length} matching Portuguese documents BEFORE update`);
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

  // Handle different MongoDB driver versions
  const news = result?.value || (result as any) || result;

  if (!news || !news._id) {
    console.warn("No Portuguese news document returned from findOneAndUpdate");
    return undefined;
  }

  console.log(`✅ Reserved Portuguese news: ${news._id} - "${news.title?.substring(0, 50)}..."`);

  return news;
};

/**
 * Mark Portuguese news candidate status
 */
export const markNewsCandidateStatusPT = async ({
  id,
  status,
  notes,
}: {
  id: unknown;
  status: "used" | "rejected" | "pending" | "reserved" | "deleted";
  notes?: string;
}) => {
  const collection = await getNewsCandidateCollectionPT();

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
 * Mark Portuguese news candidate as published to YouTube
 */
export const markNewsCandidateAsPublishedPT = async ({
  id,
  youtubeVideoUrl,
  youtubeVideoId,
}: {
  id: unknown;
  youtubeVideoUrl: string;
  youtubeVideoId: string;
}) => {
  const collection = await getNewsCandidateCollectionPT();

  const update = {
    status: "used" as const,
    usedAt: new Date(),
    publishedAt: new Date(),
    youtubeVideoUrl,
    youtubeVideoId,
  };

  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;

  console.log(`Marking Portuguese news ${id} (ObjectId: ${objectId}) as published`);

  const result = await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });

  if (result.matchedCount === 0) {
    throw new Error(`Portuguese news with id ${id} not found in database`);
  }

  if (result.modifiedCount === 0) {
    console.warn(`Portuguese news ${id} was found but not modified (might already be marked as used)`);
  } else {
    console.log(`Successfully marked Portuguese news ${id} as used and published`);
  }

  return result;
};

/**
 * Delete Portuguese news candidate (soft delete)
 */
export const deleteNewsCandidatePT = async (id: unknown) => {
  console.log(`Deleting Portuguese news candidate ${id}`);
  await markNewsCandidateStatusPT({ id, status: "deleted", notes: "Deleted by user" });
  console.log(`Portuguese news candidate ${id} marked as deleted`);
};

/**
 * Update Portuguese news candidate edits
 */
export const updateNewsCandidateEditsPT = async ({
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
  const collection = await getNewsCandidateCollectionPT();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;

  const updates: Record<string, unknown> = {};
  if (editedTitle !== undefined) updates.editedTitle = editedTitle;
  if (editedSummary !== undefined) updates.editedSummary = editedSummary;
  if (editedImageUrl !== undefined) updates.editedImageUrl = editedImageUrl;

  await collection.updateOne(
    { _id: objectId as ObjectId },
    { $set: updates }
  );

  console.log(`Updated edits for Portuguese news ${id}`);
};

/**
 * Delete old pending Portuguese news (older than specified days)
 */
export const deleteOldPendingNewsPT = async (daysOld: number = 3) => {
  const collection = await getNewsCandidateCollectionPT();

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

  console.log(`Deleted ${result.modifiedCount} old pending Portuguese news items (older than ${daysOld} days)`);
  return result.modifiedCount;
};

// ============ Ingest State Management ============

export interface IngestNewsStatePT {
  source: NewsSource;
  sourceKey: string; // e.g., "caras:gente"
  lastPage: number;
  lastFetchedAt: Date;
  totalFetched: number;
}

const getIngestStateCollectionPT = async (): Promise<Collection<IngestNewsStatePT & Document>> => {
  const db = await getMongoDatabase();
  const collection = db.collection<IngestNewsStatePT>(INGEST_STATE_COLLECTION_PT);
  await collection.createIndex({ source: 1, sourceKey: 1 }, { unique: true });
  return collection;
};

export const getNextPageForSourcePT = async (
  source: NewsSource,
  sourceKey: string
): Promise<number> => {
  const collection = await getIngestStateCollectionPT();
  const state = await collection.findOne({ source, sourceKey });

  if (!state) {
    return 1; // First page
  }

  return state.lastPage + 1;
};

export const updateSourceStatePT = async (
  source: NewsSource,
  sourceKey: string,
  page: number,
  fetchedCount: number
) => {
  const collection = await getIngestStateCollectionPT();

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

  console.log(`Updated state for Portuguese ${source}:${sourceKey} - page ${page}, fetched ${fetchedCount}`);
};
