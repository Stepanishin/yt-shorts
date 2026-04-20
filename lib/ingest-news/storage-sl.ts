import { Collection, Document, ObjectId } from "mongodb";

import { getMongoDatabase } from "@/lib/db/mongodb";

import { NewsCandidate, NewsSource } from "./types";

const COLLECTION_NAME_SL = "news_candidates_sl";
const INGEST_STATE_COLLECTION_SL = "ingest_news_state_sl";

export interface StoredNewsCandidateSL extends NewsCandidate {
  _id?: unknown;
  createdAt: Date;
  status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
  reservedAt?: Date;
  usedAt?: Date;
  deletedAt?: Date;
  publishedAt?: Date;
  notes?: string;

  editedTitle?: string;
  editedSummary?: string;
  editedImageUrl?: string;

  youtubeVideoUrl?: string;
  youtubeVideoId?: string;
}

export const getNewsCandidateCollectionSL = async (): Promise<
  Collection<StoredNewsCandidateSL & Document>
> => {
  const db = await getMongoDatabase();
  const collection = db.collection<StoredNewsCandidateSL>(COLLECTION_NAME_SL);
  await ensureIndexes(collection);
  return collection;
};

const ensureIndexes = async (collection: Collection<StoredNewsCandidateSL>) => {
  await collection.createIndex({ source: 1, externalId: 1 }, { unique: false });
  await collection.createIndex({ source: 1, url: 1 }, { unique: false });
  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ publishedDate: -1 });
};

export const insertNewsCandidatesSL = async (news: NewsCandidate[]) => {
  if (!news.length) {
    return { inserted: 0 };
  }

  const collection = await getNewsCandidateCollectionSL();

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

  console.log(`Found ${existingKeys.size} existing Slovenian news items (including deleted)`);

  const newNews = news.filter((item) => {
    if (item.externalId) {
      return !existingKeys.has(`${item.source}:${item.externalId}`);
    }
    return !existingKeys.has(`${item.source}:url:${item.url}`);
  });

  console.log(`Inserting ${newNews.length} new Slovenian news items out of ${news.length} total`);

  if (newNews.length === 0) {
    return { inserted: 0 };
  }

  const documents = newNews.map<Omit<StoredNewsCandidateSL, "_id">>((item) => ({
    ...item,
    createdAt: new Date(),
    status: "pending" as const,
  }));

  const result = await collection.insertMany(documents, { ordered: false });
  console.log(`Inserted ${result.insertedCount} new Slovenian news items`);

  return { inserted: result.insertedCount };
};

export const findRecentNewsCandidatesSL = async ({
  limit = 50,
}: {
  limit?: number;
}) => {
  const collection = await getNewsCandidateCollectionSL();
  const cursor = collection.find(
    {
      status: { $in: ["pending", "reserved", undefined] }
    },
    { sort: { createdAt: -1 }, limit }
  );
  return cursor.toArray();
};

export const findNewsCandidateByIdSL = async (id: unknown) => {
  const collection = await getNewsCandidateCollectionSL();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  return collection.findOne({ _id: objectId as ObjectId });
};

export const reserveNextNewsCandidateSL = async ({
  language = "sl",
  sources,
}: {
  language?: string;
  sources?: NewsCandidate["source"][];
}) => {
  const collection = await getNewsCandidateCollectionSL();

  const query: Record<string, unknown> = {
    status: { $in: [undefined, "pending"] },
  };

  if (language) {
    query.language = language;
  }

  if (sources && sources.length > 0) {
    query.source = { $in: sources };
  }

  console.log("reserveNextNewsCandidateSL query:", JSON.stringify(query, null, 2));

  const matchingDocs = await collection.find(query).limit(5).toArray();
  console.log(`Found ${matchingDocs.length} matching Slovenian documents BEFORE update`);

  const update = {
    $set: {
      status: "reserved" as const,
      reservedAt: new Date(),
    },
  };

  const result = await collection.findOneAndUpdate(query, update, {
    sort: { publishedDate: -1, createdAt: -1 },
    returnDocument: "after",
  });

  const news = result?.value || (result as any) || result;

  if (!news || !news._id) {
    console.warn("No Slovenian news document returned from findOneAndUpdate");
    return undefined;
  }

  console.log(`Reserved Slovenian news: ${news._id} - "${news.title?.substring(0, 50)}..."`);

  return news;
};

export const markNewsCandidateStatusSL = async ({
  id,
  status,
  notes,
}: {
  id: unknown;
  status: "used" | "rejected" | "pending" | "reserved" | "deleted";
  notes?: string;
}) => {
  const collection = await getNewsCandidateCollectionSL();

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

export const markNewsCandidateAsPublishedSL = async ({
  id,
  youtubeVideoUrl,
  youtubeVideoId,
}: {
  id: unknown;
  youtubeVideoUrl: string;
  youtubeVideoId: string;
}) => {
  const collection = await getNewsCandidateCollectionSL();

  const update = {
    status: "used" as const,
    usedAt: new Date(),
    publishedAt: new Date(),
    youtubeVideoUrl,
    youtubeVideoId,
  };

  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;

  console.log(`Marking Slovenian news ${id} (ObjectId: ${objectId}) as published`);

  const result = await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });

  if (result.matchedCount === 0) {
    throw new Error(`Slovenian news with id ${id} not found in database`);
  }

  if (result.modifiedCount === 0) {
    console.warn(`Slovenian news ${id} was found but not modified (might already be marked as used)`);
  } else {
    console.log(`Successfully marked Slovenian news ${id} as used and published`);
  }

  return result;
};

export const deleteNewsCandidateSL = async (id: unknown) => {
  console.log(`Deleting Slovenian news candidate ${id}`);
  await markNewsCandidateStatusSL({ id, status: "deleted", notes: "Deleted by user" });
  console.log(`Slovenian news candidate ${id} marked as deleted`);
};

export const updateNewsCandidateEditsSL = async ({
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
  const collection = await getNewsCandidateCollectionSL();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;

  const updates: Record<string, unknown> = {};
  if (editedTitle !== undefined) updates.editedTitle = editedTitle;
  if (editedSummary !== undefined) updates.editedSummary = editedSummary;
  if (editedImageUrl !== undefined) updates.editedImageUrl = editedImageUrl;

  await collection.updateOne(
    { _id: objectId as ObjectId },
    { $set: updates }
  );

  console.log(`Updated edits for Slovenian news ${id}`);
};

export const deleteOldPendingNewsSL = async (daysOld: number = 3) => {
  const collection = await getNewsCandidateCollectionSL();

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

  console.log(`Deleted ${result.modifiedCount} old pending Slovenian news items (older than ${daysOld} days)`);
  return result.modifiedCount;
};

// ============ Ingest State Management ============

export interface IngestNewsStateSL {
  source: NewsSource;
  sourceKey: string;
  lastPage: number;
  lastFetchedAt: Date;
  totalFetched: number;
}

const getIngestStateCollectionSL = async (): Promise<Collection<IngestNewsStateSL & Document>> => {
  const db = await getMongoDatabase();
  const collection = db.collection<IngestNewsStateSL>(INGEST_STATE_COLLECTION_SL);
  await collection.createIndex({ source: 1, sourceKey: 1 }, { unique: true });
  return collection;
};

export const getNextPageForSourceSL = async (
  source: NewsSource,
  sourceKey: string
): Promise<number> => {
  const collection = await getIngestStateCollectionSL();
  const state = await collection.findOne({ source, sourceKey });

  if (!state) {
    return 1;
  }

  return state.lastPage + 1;
};

export const updateSourceStateSL = async (
  source: NewsSource,
  sourceKey: string,
  page: number,
  fetchedCount: number
) => {
  const collection = await getIngestStateCollectionSL();

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

  console.log(`Updated state for Slovenian ${source}:${sourceKey} - page ${page}, fetched ${fetchedCount}`);
};
