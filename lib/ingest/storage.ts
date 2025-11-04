import { Collection, Document, ObjectId } from "mongodb";

import { getMongoDatabase } from "@/lib/db/mongodb";

import { JokeCandidate } from "./types";

const COLLECTION_NAME = "joke_candidates";

export interface StoredJokeCandidate extends JokeCandidate {
  _id?: unknown;
  createdAt: Date;
  status?: "pending" | "reserved" | "used" | "rejected";
  reservedAt?: Date;
  usedAt?: Date;
  notes?: string;
  youtubeVideoUrl?: string;
  youtubeVideoId?: string;
  publishedAt?: Date;
}

export const getJokeCandidateCollection = async (): Promise<
  Collection<StoredJokeCandidate & Document>
> => {
  const db = await getMongoDatabase();
  const collection = db.collection<StoredJokeCandidate>(COLLECTION_NAME);
  await ensureIndexes(collection);
  return collection;
};

const ensureIndexes = async (collection: Collection<StoredJokeCandidate>) => {
  await collection.createIndex({ source: 1, externalId: 1 }, { unique: false });
  await collection.createIndex({ createdAt: -1 });
};

export const insertJokeCandidates = async (jokes: JokeCandidate[]) => {
  if (!jokes.length) {
    return { inserted: 0 };
  }

  const collection = await getJokeCandidateCollection();
  const documents = jokes.map<Omit<StoredJokeCandidate, "_id">>((joke) => ({
    ...joke,
    createdAt: new Date(),
    status: "pending" as const,
  }));

  const result = await collection.insertMany(documents, { ordered: false });
  return { inserted: result.insertedCount };
};

export const findRecentJokeCandidates = async ({
  limit = 50,
}: {
  limit?: number;
}) => {
  const collection = await getJokeCandidateCollection();
  // Фильтруем анекдоты - показываем только pending и reserved, исключаем used и rejected
  const cursor = collection.find(
    {
      status: { $in: ["pending", "reserved", undefined] }
    },
    { sort: { createdAt: -1 }, limit }
  );
  return cursor.toArray();
};

export const findJokeCandidateById = async (id: unknown) => {
  const collection = await getJokeCandidateCollection();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  return collection.findOne({ _id: objectId as ObjectId });
};

export const reserveNextJokeCandidate = async ({
  language = "es",
  sources,
}: {
  language?: string;
  sources?: JokeCandidate["source"][];
}) => {
  const collection = await getJokeCandidateCollection();

  const query: Record<string, unknown> = {
    status: { $in: [undefined, "pending"] },
  };

  if (language) {
    query.language = language;
  }

  if (sources && sources.length > 0) {
    query.source = { $in: sources };
  }

  const update = {
    $set: {
      status: "reserved" as const,
      reservedAt: new Date(),
    },
  };

  const result = await collection.findOneAndUpdate(query, update, {
    sort: { ratingPercent: -1, createdAt: 1 },
    returnDocument: "after",
  });

  return result?.value ?? undefined;
};

export const markJokeCandidateStatus = async ({
  id,
  status,
  notes,
}: {
  id: unknown;
  status: "used" | "rejected" | "pending" | "reserved";
  notes?: string;
}) => {
  const collection = await getJokeCandidateCollection();

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

  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });
};

export const markJokeCandidateAsPublished = async ({
  id,
  youtubeVideoUrl,
  youtubeVideoId,
}: {
  id: unknown;
  youtubeVideoUrl: string;
  youtubeVideoId: string;
}) => {
  const collection = await getJokeCandidateCollection();

  const update = {
    status: "used" as const,
    usedAt: new Date(),
    publishedAt: new Date(),
    youtubeVideoUrl,
    youtubeVideoId,
  };

  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });
};

