import { Collection, Document, ObjectId } from "mongodb";

import { getMongoDatabase } from "@/lib/db/mongodb";

export type VideoJobStatus = "pending" | "running" | "completed" | "failed";

export interface VideoJob {
  _id?: unknown;
  jokeId: unknown;
  jokeSource: string;
  jokeText: string;
  jokeTitle?: string;
  editedText?: string; // Отредактированный текст для отображения в видео
  jokeMeta?: Record<string, unknown>;
  status: VideoJobStatus;
  backgroundVideoUrl?: string;
  backgroundPrompt?: string;
  finalVideoUrl?: string; // URL финального видео с текстом и эмодзи
  renderingStatus?: "pending" | "running" | "completed" | "failed"; // Статус рендеринга финального видео
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

export const findVideoJobById = async (id: unknown) => {
  const collection = await getCollection();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  return collection.findOne({ _id: objectId as ObjectId });
};

export const findVideoJobByJokeId = async (jokeId: unknown) => {
  const collection = await getCollection();
  // Пробуем найти как ObjectId, если не получается - как строку
  const jokeIdQuery: unknown = ObjectId.isValid(String(jokeId)) 
    ? new ObjectId(String(jokeId)) 
    : String(jokeId);
  // Ищем самую последнюю job для этого jokeId
  const jobs = await collection.find({ jokeId: jokeIdQuery }, { sort: { createdAt: -1 }, limit: 1 }).toArray();
  return jobs[0] || null;
};

export const updateVideoJobStatus = async ({
  id,
  status,
  error,
  backgroundVideoUrl,
  backgroundPrompt,
  editedText,
  finalVideoUrl,
  renderingStatus,
}: {
  id: unknown;
  status: VideoJobStatus;
  error?: string;
  backgroundVideoUrl?: string;
  backgroundPrompt?: string;
  editedText?: string;
  finalVideoUrl?: string;
  renderingStatus?: "pending" | "running" | "completed" | "failed";
}) => {
  const collection = await getCollection();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  const update: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  };

  if (error !== undefined) {
    update.error = error;
  }
  if (backgroundVideoUrl !== undefined) {
    update.backgroundVideoUrl = backgroundVideoUrl;
  }
  if (backgroundPrompt !== undefined) {
    update.backgroundPrompt = backgroundPrompt;
  }
  if (editedText !== undefined) {
    update.editedText = editedText;
  }
  if (finalVideoUrl !== undefined) {
    update.finalVideoUrl = finalVideoUrl;
  }
  if (renderingStatus !== undefined) {
    update.renderingStatus = renderingStatus;
  }

  await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });
};

