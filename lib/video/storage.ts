import { Collection, Document, ObjectId } from "mongodb";

import { getMongoDatabase } from "@/lib/db/mongodb";

export type VideoJobStatus = "pending" | "running" | "completed" | "failed";

export interface VideoJob {
  _id?: unknown;
  jokeId: unknown;
  jokeSource: string;
  jokeText: string;
  jokeTitle?: string;
  jokeMeta?: Record<string, unknown>;
  status: VideoJobStatus;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

const COLLECTION_NAME = "video_jobs";

const getCollection = async (): Promise<Collection<VideoJob & Document>> => {
  const db = await getMongoDatabase();
  const collection = db.collection<VideoJob>(COLLECTION_NAME);
  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ status: 1 });
  return collection as Collection<VideoJob & Document>;
};

export const createVideoJob = async (job: Omit<VideoJob, "_id" | "createdAt" | "updatedAt">) => {
  const collection = await getCollection();
  const document: Omit<VideoJob, "_id"> = {
    ...job,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await collection.insertOne(document as Omit<VideoJob, "_id"> & Document);
  return { ...document, _id: result.insertedId };
};

export const listVideoJobs = async ({ limit = 50 }: { limit?: number } = {}) => {
  const collection = await getCollection();
  return collection.find({}, { sort: { createdAt: -1 }, limit }).toArray();
};

export const updateVideoJobStatus = async ({
  id,
  status,
  error,
}: {
  id: unknown;
  status: VideoJobStatus;
  error?: string;
}) => {
  const collection = await getCollection();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  await collection.updateOne(
    { _id: objectId as ObjectId },
    {
      $set: {
        status,
        error,
        updatedAt: new Date(),
      },
    }
  );
};

