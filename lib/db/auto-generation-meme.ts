import { ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";

// ============================================
// TypeScript Interfaces
// ============================================

export interface PublishTime {
  id: string;
  hour: number; // 0-23
  minute: number; // 0-59
  isEnabled: boolean;
}

export interface MemeAutoGenerationTemplate {
  imageEffect: "none" | "zoom-in" | "zoom-in-out" | "pan-right-left";
  duration: number; // 8-15 seconds
  audio?: {
    urls: string[]; // List of audio URLs for random selection
    randomTrim: boolean;
  };
}

export interface YouTubeMemeSettings {
  privacyStatus: "public" | "private" | "unlisted";
  tags: string[];
  useAI: boolean; // Generate title/description via AI
  channelId?: string;
  manualChannelId?: string;
  savedChannelId?: string;
}

export interface MemeAutoGenerationStats {
  totalGenerated: number;
  totalPublished: number;
  lastGeneratedAt?: Date;
  lastPublishedAt?: Date;
}

export interface MemeAutoGenerationConfig {
  _id?: ObjectId;
  userId: string;
  isEnabled: boolean;
  videosPerDay: number; // 1-5 videos per day
  publishTimes: PublishTime[];
  template: MemeAutoGenerationTemplate;
  youtube: YouTubeMemeSettings;
  stats: MemeAutoGenerationStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemeAutoGenerationJob {
  _id?: ObjectId;
  userId: string;
  configId: string;
  status: "pending" | "processing" | "completed" | "failed";

  // Meme data
  memeId: string; // ID from reddit_memes collection
  memeTitle: string;
  memeImageUrl: string;

  // Selected resources
  selectedResources: {
    audioUrl?: string;
    audioTrimStart?: number;
    audioTrimEnd?: number;
  };

  // Results
  results?: {
    renderedVideoUrl?: string;
    scheduledVideoId?: string;
    scheduledAt?: Date;
  };

  // Error handling
  errorMessage?: string;
  retryCount: number;

  createdAt: Date;
  processedAt?: Date;
}

// ============================================
// Database Connection
// ============================================

const CONFIG_COLLECTION = "auto_generation_meme_configs";
const QUEUE_COLLECTION = "auto_generation_meme_queue";

async function getConfigCollection() {
  const db = await getMongoDatabase();
  return db.collection<MemeAutoGenerationConfig>(CONFIG_COLLECTION);
}

async function getQueueCollection() {
  const db = await getMongoDatabase();
  return db.collection<MemeAutoGenerationJob>(QUEUE_COLLECTION);
}

// ============================================
// Config CRUD Functions
// ============================================

/**
 * Create or update meme auto-generation configuration
 */
export async function saveMemeAutoGenerationConfig(
  config: Omit<MemeAutoGenerationConfig, "_id" | "createdAt" | "updatedAt"> & { _id?: ObjectId }
): Promise<MemeAutoGenerationConfig> {
  const collection = await getConfigCollection();
  const now = new Date();

  if (config._id) {
    // Update existing config
    const result = await collection.findOneAndUpdate(
      { _id: config._id },
      {
        $set: {
          ...config,
          updatedAt: now,
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      throw new Error("Config not found");
    }

    return result;
  } else {
    // Create new config
    const newConfig: MemeAutoGenerationConfig = {
      ...config,
      stats: config.stats || {
        totalGenerated: 0,
        totalPublished: 0,
      },
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(newConfig);
    return { ...newConfig, _id: result.insertedId };
  }
}

/**
 * Get meme auto-generation configuration for a user
 */
export async function getMemeAutoGenerationConfig(
  userId: string
): Promise<MemeAutoGenerationConfig | null> {
  const collection = await getConfigCollection();
  return collection.findOne({ userId });
}

/**
 * Delete meme auto-generation configuration
 */
export async function deleteMemeAutoGenerationConfig(userId: string): Promise<boolean> {
  const collection = await getConfigCollection();
  const result = await collection.deleteOne({ userId });
  return result.deletedCount > 0;
}

/**
 * Get all active meme auto-generation configurations
 */
export async function getActiveMemeAutoGenerationConfigs(): Promise<MemeAutoGenerationConfig[]> {
  const collection = await getConfigCollection();
  return collection.find({ isEnabled: true }).toArray();
}

/**
 * Increment generated count for a config
 */
export async function incrementMemeGeneratedCount(configId: ObjectId): Promise<void> {
  const collection = await getConfigCollection();
  await collection.updateOne(
    { _id: configId },
    {
      $inc: { "stats.totalGenerated": 1 },
      $set: { "stats.lastGeneratedAt": new Date() },
    }
  );
}

/**
 * Increment published count for a config
 */
export async function incrementMemePublishedCount(configId: ObjectId): Promise<void> {
  const collection = await getConfigCollection();
  await collection.updateOne(
    { _id: configId },
    {
      $inc: { "stats.totalPublished": 1 },
      $set: { "stats.lastPublishedAt": new Date() },
    }
  );
}

// ============================================
// Job Queue Functions
// ============================================

/**
 * Create a new meme auto-generation job
 */
export async function createMemeAutoGenerationJob(
  job: Omit<MemeAutoGenerationJob, "_id" | "createdAt">
): Promise<MemeAutoGenerationJob> {
  const collection = await getQueueCollection();

  const newJob: MemeAutoGenerationJob = {
    ...job,
    createdAt: new Date(),
  };

  const result = await collection.insertOne(newJob);
  return { ...newJob, _id: result.insertedId };
}

/**
 * Update meme job status
 */
export async function updateMemeJobStatus(
  jobId: ObjectId,
  status: MemeAutoGenerationJob["status"],
  updates?: Partial<MemeAutoGenerationJob>
): Promise<void> {
  const collection = await getQueueCollection();

  const updateData: Record<string, unknown> = {
    status,
    processedAt: new Date(),
    ...updates,
  };

  await collection.updateOne({ _id: jobId }, { $set: updateData });
}

/**
 * Get recent meme jobs for a user
 */
export async function getRecentMemeJobs(
  userId: string,
  limit: number = 20
): Promise<MemeAutoGenerationJob[]> {
  const collection = await getQueueCollection();
  return collection
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Get pending meme jobs
 */
export async function getPendingMemeJobs(limit: number = 10): Promise<MemeAutoGenerationJob[]> {
  const collection = await getQueueCollection();
  return collection
    .find({ status: "pending" })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();
}
