import { ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";

// ============================================
// Interfaces
// ============================================

export interface PublishTime {
  id: string;
  hour: number;
  minute: number;
  isEnabled: boolean;
}

export interface CelebrityFactsAutoGenerationConfig {
  _id?: ObjectId;
  userId: string;
  isEnabled: boolean;
  videosPerDay: number;
  publishTimes: PublishTime[];
  selectedTemplate?: "template1" | "template2";
  template: {
    audio?: {
      urls: string[];
      randomTrim: boolean;
      duration: number;
    };
  };
  youtube: {
    privacyStatus: "public" | "private" | "unlisted";
    tags: string[];
    useAI: boolean;
    channelId?: string;
    manualChannelId?: string;
    savedChannelId?: string;
  };
  stats: {
    totalGenerated: number;
    totalPublished: number;
    lastGeneratedAt?: Date;
    lastPublishedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CelebrityFactsAutoGenerationJob {
  _id?: ObjectId;
  userId: string;
  configId: string;
  status: "pending" | "processing" | "completed" | "failed";

  factId: string;
  factTitle: string;
  factText: string;
  imageHashtags: string[];

  selectedResources: {
    audioUrl?: string;
    audioTrimStart?: number;
    audioTrimEnd?: number;
  };

  results?: {
    renderedVideoUrl?: string;
    scheduledVideoId?: string;
    scheduledAt?: Date;
  };

  errorMessage?: string;
  retryCount: number;
  createdAt: Date;
  processedAt?: Date;
}

// ============================================
// Collections
// ============================================

const CONFIG_COLLECTION = "auto_generation_configs_celebrity_facts";
const QUEUE_COLLECTION = "auto_generation_queue_celebrity_facts";

async function getConfigCollection() {
  const db = await getMongoDatabase();
  return db.collection<CelebrityFactsAutoGenerationConfig>(CONFIG_COLLECTION);
}

async function getQueueCollection() {
  const db = await getMongoDatabase();
  return db.collection<CelebrityFactsAutoGenerationJob>(QUEUE_COLLECTION);
}

// ============================================
// Config CRUD
// ============================================

export async function saveCelebrityFactsAutoGenerationConfig(
  config: Omit<CelebrityFactsAutoGenerationConfig, "_id" | "createdAt" | "updatedAt"> & { _id?: ObjectId }
): Promise<CelebrityFactsAutoGenerationConfig> {
  const collection = await getConfigCollection();
  const now = new Date();

  if (config._id) {
    const result = await collection.findOneAndUpdate(
      { _id: config._id },
      { $set: { ...config, updatedAt: now } },
      { returnDocument: "after" }
    );
    if (!result) throw new Error(`Config with ID ${config._id} not found`);
    return result;
  } else {
    const newConfig: CelebrityFactsAutoGenerationConfig = { ...config, createdAt: now, updatedAt: now };
    const result = await collection.insertOne(newConfig as any);
    return { ...newConfig, _id: result.insertedId };
  }
}

export async function getCelebrityFactsAutoGenerationConfig(
  userId: string
): Promise<CelebrityFactsAutoGenerationConfig | null> {
  const collection = await getConfigCollection();
  return collection.findOne({ userId });
}

export async function getActiveCelebrityFactsAutoGenerationConfigs(): Promise<CelebrityFactsAutoGenerationConfig[]> {
  const collection = await getConfigCollection();
  return collection.find({ isEnabled: true }).toArray();
}

export async function incrementCelebrityFactsGeneratedCount(configId: ObjectId): Promise<void> {
  const collection = await getConfigCollection();
  await collection.updateOne(
    { _id: configId },
    {
      $inc: { "stats.totalGenerated": 1 },
      $set: { "stats.lastGeneratedAt": new Date() },
      $currentDate: { updatedAt: true },
    }
  );
}

// ============================================
// Job CRUD
// ============================================

export async function createCelebrityFactsAutoGenerationJob(
  job: Omit<CelebrityFactsAutoGenerationJob, "_id" | "createdAt">
): Promise<CelebrityFactsAutoGenerationJob> {
  const collection = await getQueueCollection();
  const newJob: CelebrityFactsAutoGenerationJob = { ...job, createdAt: new Date() };
  const result = await collection.insertOne(newJob as any);
  return { ...newJob, _id: result.insertedId };
}

export async function updateCelebrityFactsJobStatus(
  jobId: ObjectId,
  status: CelebrityFactsAutoGenerationJob["status"],
  updates?: {
    errorMessage?: string;
    results?: CelebrityFactsAutoGenerationJob["results"];
  }
): Promise<void> {
  const collection = await getQueueCollection();
  const updateFields: any = { status };
  if (status === "completed" || status === "failed") updateFields.processedAt = new Date();
  if (updates?.errorMessage) updateFields.errorMessage = updates.errorMessage;
  if (updates?.results) updateFields.results = updates.results;
  await collection.updateOne({ _id: jobId }, { $set: updateFields });
}
