import { Collection, Document, ObjectId } from "mongodb";

import { getMongoDatabase } from "@/lib/db/mongodb";

import { CelebrityFact, StoredCelebrityFact } from "./types";

const COLLECTION_NAME = "celebrity_facts";

export const getCelebrityFactCollection = async (): Promise<
  Collection<StoredCelebrityFact & Document>
> => {
  const db = await getMongoDatabase();
  const collection = db.collection<StoredCelebrityFact>(COLLECTION_NAME);
  await ensureIndexes(collection);
  return collection;
};

const ensureIndexes = async (collection: Collection<StoredCelebrityFact>) => {
  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ status: 1 });
};

/**
 * Insert a single celebrity fact
 */
export const insertCelebrityFact = async (fact: CelebrityFact) => {
  const collection = await getCelebrityFactCollection();

  const document: Omit<StoredCelebrityFact, "_id"> = {
    ...fact,
    createdAt: new Date(),
    status: "pending",
  };

  const result = await collection.insertOne(document as unknown as StoredCelebrityFact & Document);
  return { insertedId: result.insertedId };
};

/**
 * Find recent celebrity facts
 */
export const findRecentCelebrityFacts = async ({
  limit = 50,
}: {
  limit?: number;
} = {}) => {
  const collection = await getCelebrityFactCollection();
  const cursor = collection.find(
    { status: { $in: ["pending", "reserved", undefined] } },
    { sort: { createdAt: -1 }, limit }
  );
  return cursor.toArray();
};

/**
 * Find celebrity fact by ID
 */
export const findCelebrityFactById = async (id: unknown) => {
  const collection = await getCelebrityFactCollection();
  const objectId = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  return collection.findOne({ _id: objectId as ObjectId });
};

/**
 * Update celebrity fact status
 */
export const markCelebrityFactStatus = async ({
  id,
  status,
  notes,
}: {
  id: unknown;
  status: "pending" | "reserved" | "used" | "rejected" | "deleted";
  notes?: string;
}) => {
  const collection = await getCelebrityFactCollection();

  const update: Record<string, unknown> = { status, notes };

  if (status === "used") update.usedAt = new Date();
  if (status === "reserved") update.reservedAt = new Date();
  if (status === "deleted") update.deletedAt = new Date();
  if (status === "pending") update.reservedAt = undefined;

  const objectId = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });
};

/**
 * Delete celebrity fact (soft delete)
 */
export const deleteCelebrityFact = async (id: unknown) => {
  await markCelebrityFactStatus({ id, status: "deleted", notes: "Deleted by user" });
};
