import { Collection, ObjectId } from "mongodb";
import { getMongoDatabase } from "@/lib/db/mongodb";

const COLLECTION = "longform_jobs";

export type LongformJobStatus = "pending" | "processing" | "completed" | "failed";

export interface LongformJob {
  _id?: ObjectId;
  userId: string;
  celebrityName: string;
  status: LongformJobStatus;
  currentStep?: string; // human-readable progress, e.g. "3/9 Generating subtitles"
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  errorMessage?: string;
  results?: {
    videoUrl?: string;
    thumbnailUrl?: string;
    title?: string;
    duration?: number;
    scenesCount?: number;
    scheduledAt?: Date;
  };
}

async function getCollection(): Promise<Collection<LongformJob>> {
  const db = await getMongoDatabase();
  return db.collection<LongformJob>(COLLECTION);
}

export async function createLongformJob(
  userId: string,
  celebrityName: string
): Promise<LongformJob> {
  const collection = await getCollection();
  const job: LongformJob = {
    userId,
    celebrityName,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await collection.insertOne(job);
  return { ...job, _id: result.insertedId };
}

export async function updateLongformJob(
  jobId: string | ObjectId,
  updates: Partial<Omit<LongformJob, "_id" | "userId" | "createdAt">>
): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    { _id: new ObjectId(String(jobId)) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
}

export async function getLongformJob(
  jobId: string | ObjectId
): Promise<LongformJob | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: new ObjectId(String(jobId)) });
}

export async function listLongformJobs(
  userId: string,
  limit = 20
): Promise<LongformJob[]> {
  const collection = await getCollection();
  return collection
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}
