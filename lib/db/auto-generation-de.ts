import { MongoClient, Db, ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";

// ============================================
// TypeScript Interfaces
// ============================================

export interface PublishTimeDE {
  id: string;
  hour: number; // 0-23
  minute: number; // 0-59
  isEnabled: boolean;
}

export interface AutoGenerationTemplateDE {
  text: {
    fontSize: number;
    color: string; // Format: "black@1"
    backgroundColor: string; // Format: "white@0.6"
    boxPadding: number;
    fontWeight: "normal" | "bold";
    position: { x: number; y: number };
    width: number;
    lineSpacing?: number; // Line spacing (default: 12)
  };
  gif: {
    urls: string[]; // List of GIF URLs for random selection
    position: "bottom-right" | "fixed";
    fixedPosition?: { x: number; y: number };
    width: number;
    height: number;
  };
  audio: {
    urls: string[]; // List of audio URLs for random selection
    randomTrim: boolean; // true - trim from random position
    duration: number; // Target duration in seconds
  };
  background: {
    unsplashKeywords: string[]; // Keywords for Unsplash search
    imageEffect: "none" | "zoom-in" | "zoom-in-out" | "pan-right-left";
    fallbackImageUrl?: string; // Fallback if Unsplash unavailable
  };
}

export interface YouTubeAutoSettingsDE {
  privacyStatus: "public" | "private" | "unlisted";
  tags: string[];
  titleTemplate?: string; // Template with variables like {joke}
  descriptionTemplate?: string;
  useAI: boolean; // Generate title/description via AI (in German)
  channelId?: string; // Optional: specific YouTube channel ID (if user has multiple channels)
}

export interface AutoGenerationStatsDE {
  totalGenerated: number;
  totalPublished: number;
  lastGeneratedAt?: Date;
  lastPublishedAt?: Date;
}

export interface AutoGenerationConfigDE {
  _id?: ObjectId;
  userId: string; // Reference to User._id or googleId
  isEnabled: boolean;
  videosPerDay: number; // 1-10 videos per day
  publishTimes: PublishTimeDE[];
  template: AutoGenerationTemplateDE;
  youtube: YouTubeAutoSettingsDE;
  stats: AutoGenerationStatsDE;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutoGenerationJobDE {
  _id?: ObjectId;
  userId: string;
  configId: string; // Reference to AutoGenerationConfigDE._id
  status: "pending" | "processing" | "completed" | "failed";

  // Generation data
  jokeId: string; // ID from joke_candidates_de collection
  jokeText: string; // Saved joke text

  // Selected resources
  selectedResources: {
    backgroundImageUrl?: string;
    gifUrl?: string;
    audioUrl?: string;
    audioTrimStart?: number;
    audioTrimEnd?: number;
  };

  // Results
  results?: {
    renderedVideoUrl?: string;
    scheduledVideoId?: string; // ID in ScheduledVideo array
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

const CONFIG_COLLECTION_DE = "auto_generation_configs_de";
const QUEUE_COLLECTION_DE = "auto_generation_queue_de";

async function getConfigCollectionDE() {
  const db = await getMongoDatabase();
  return db.collection<AutoGenerationConfigDE>(CONFIG_COLLECTION_DE);
}

async function getQueueCollectionDE() {
  const db = await getMongoDatabase();
  return db.collection<AutoGenerationJobDE>(QUEUE_COLLECTION_DE);
}

// ============================================
// Config CRUD Functions
// ============================================

/**
 * Create or update auto-generation configuration for German videos
 */
export async function saveAutoGenerationConfigDE(
  config: Omit<AutoGenerationConfigDE, "_id" | "createdAt" | "updatedAt"> & { _id?: ObjectId }
): Promise<AutoGenerationConfigDE> {
  const collection = await getConfigCollectionDE();

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
      throw new Error(`Config with ID ${config._id} not found`);
    }

    return result;
  } else {
    // Create new config
    const newConfig: AutoGenerationConfigDE = {
      ...config,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(newConfig as any);

    return {
      ...newConfig,
      _id: result.insertedId,
    };
  }
}

/**
 * Get auto-generation config by user ID for German videos
 */
export async function getAutoGenerationConfigDE(
  userId: string
): Promise<AutoGenerationConfigDE | null> {
  const collection = await getConfigCollectionDE();

  const config = await collection.findOne({ userId });

  return config;
}

/**
 * Get all active auto-generation configs for German videos (isEnabled=true)
 */
export async function getActiveAutoGenerationConfigsDE(): Promise<AutoGenerationConfigDE[]> {
  const collection = await getConfigCollectionDE();

  const cursor = collection.find({ isEnabled: true });

  return cursor.toArray();
}

/**
 * Delete auto-generation config for German videos
 */
export async function deleteAutoGenerationConfigDE(userId: string): Promise<boolean> {
  const collection = await getConfigCollectionDE();

  const result = await collection.deleteOne({ userId });

  return result.deletedCount > 0;
}

/**
 * Update config stats for German videos
 */
export async function updateConfigStatsDE(
  configId: ObjectId,
  updates: Partial<AutoGenerationStatsDE>
): Promise<void> {
  const collection = await getConfigCollectionDE();

  const updateFields: any = {};

  if (updates.totalGenerated !== undefined) {
    updateFields["stats.totalGenerated"] = updates.totalGenerated;
  }
  if (updates.totalPublished !== undefined) {
    updateFields["stats.totalPublished"] = updates.totalPublished;
  }
  if (updates.lastGeneratedAt !== undefined) {
    updateFields["stats.lastGeneratedAt"] = updates.lastGeneratedAt;
  }
  if (updates.lastPublishedAt !== undefined) {
    updateFields["stats.lastPublishedAt"] = updates.lastPublishedAt;
  }

  await collection.updateOne(
    { _id: configId },
    {
      $set: updateFields,
      $currentDate: { updatedAt: true },
    }
  );
}

/**
 * Increment totalGenerated counter for German videos
 */
export async function incrementGeneratedCountDE(configId: ObjectId): Promise<void> {
  const collection = await getConfigCollectionDE();

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
// Job CRUD Functions
// ============================================

/**
 * Create a new auto-generation job for German videos
 */
export async function createAutoGenerationJobDE(
  job: Omit<AutoGenerationJobDE, "_id" | "createdAt">
): Promise<AutoGenerationJobDE> {
  const collection = await getQueueCollectionDE();

  const newJob: AutoGenerationJobDE = {
    ...job,
    createdAt: new Date(),
  };

  const result = await collection.insertOne(newJob as any);

  return {
    ...newJob,
    _id: result.insertedId,
  };
}

/**
 * Update job status for German videos
 */
export async function updateJobStatusDE(
  jobId: ObjectId,
  status: AutoGenerationJobDE["status"],
  updates?: {
    errorMessage?: string;
    results?: AutoGenerationJobDE["results"];
  }
): Promise<void> {
  const collection = await getQueueCollectionDE();

  const updateFields: any = {
    status,
  };

  if (status === "completed" || status === "failed") {
    updateFields.processedAt = new Date();
  }

  if (updates?.errorMessage) {
    updateFields.errorMessage = updates.errorMessage;
  }

  if (updates?.results) {
    updateFields.results = updates.results;
  }

  await collection.updateOne(
    { _id: jobId },
    { $set: updateFields }
  );
}

/**
 * Get jobs by user ID and optional filters for German videos
 */
export async function getJobsByUserDE(
  userId: string,
  options?: {
    status?: AutoGenerationJobDE["status"];
    limit?: number;
  }
): Promise<AutoGenerationJobDE[]> {
  const collection = await getQueueCollectionDE();

  const query: any = { userId };

  if (options?.status) {
    query.status = options.status;
  }

  const cursor = collection
    .find(query)
    .sort({ createdAt: -1 })
    .limit(options?.limit || 50);

  return cursor.toArray();
}

/**
 * Get jobs created today for a specific user (German videos)
 */
export async function getJobsByDateDE(
  userId: string,
  date: Date
): Promise<AutoGenerationJobDE[]> {
  const collection = await getQueueCollectionDE();

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const cursor = collection.find({
    userId,
    createdAt: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  return cursor.toArray();
}

/**
 * Increment retry count for a job (German videos)
 */
export async function incrementJobRetryCountDE(jobId: ObjectId): Promise<void> {
  const collection = await getQueueCollectionDE();

  await collection.updateOne(
    { _id: jobId },
    { $inc: { retryCount: 1 } }
  );
}
