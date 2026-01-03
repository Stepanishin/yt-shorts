import { MongoClient, Db, ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";

// ============================================
// TypeScript Interfaces
// ============================================

export interface PublishTimeFR {
  id: string;
  hour: number; // 0-23
  minute: number; // 0-59
  isEnabled: boolean;
}

export interface AutoGenerationTemplateFR {
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

export interface YouTubeAutoSettingsFR {
  privacyStatus: "public" | "private" | "unlisted";
  tags: string[];
  titleTemplate?: string; // Template with variables like {joke}
  descriptionTemplate?: string;
  useAI: boolean; // Generate title/description via AI (in French)
  channelId?: string; // Optional: specific YouTube channel ID (if user has multiple channels)
}

export interface AutoGenerationStatsFR {
  totalGenerated: number;
  totalPublished: number;
  lastGeneratedAt?: Date;
  lastPublishedAt?: Date;
}

export interface AutoGenerationConfigFR {
  _id?: ObjectId;
  userId: string; // Reference to User._id or googleId
  isEnabled: boolean;
  videosPerDay: number; // 1-10 videos per day
  publishTimes: PublishTimeFR[];
  template: AutoGenerationTemplateFR;
  youtube: YouTubeAutoSettingsFR;
  stats: AutoGenerationStatsFR;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutoGenerationJobFR {
  _id?: ObjectId;
  userId: string;
  configId: string; // Reference to AutoGenerationConfigFR._id
  status: "pending" | "processing" | "completed" | "failed";

  // Generation data
  jokeId: string; // ID from joke_candidates_fr collection
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

const CONFIG_COLLECTION_FR = "auto_generation_configs_fr";
const QUEUE_COLLECTION_FR = "auto_generation_queue_fr";

async function getConfigCollectionFR() {
  const db = await getMongoDatabase();
  return db.collection<AutoGenerationConfigFR>(CONFIG_COLLECTION_FR);
}

async function getQueueCollectionFR() {
  const db = await getMongoDatabase();
  return db.collection<AutoGenerationJobFR>(QUEUE_COLLECTION_FR);
}

// ============================================
// Config CRUD Functions
// ============================================

/**
 * Create or update auto-generation configuration for French videos
 */
export async function saveAutoGenerationConfigFR(
  config: Omit<AutoGenerationConfigFR, "_id" | "createdAt" | "updatedAt"> & { _id?: ObjectId }
): Promise<AutoGenerationConfigFR> {
  const collection = await getConfigCollectionFR();

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
    const newConfig: AutoGenerationConfigFR = {
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
 * Get auto-generation config by user ID for French videos
 */
export async function getAutoGenerationConfigFR(
  userId: string
): Promise<AutoGenerationConfigFR | null> {
  const collection = await getConfigCollectionFR();

  const config = await collection.findOne({ userId });

  return config;
}

/**
 * Get all active auto-generation configs for French videos (isEnabled=true)
 */
export async function getActiveAutoGenerationConfigsFR(): Promise<AutoGenerationConfigFR[]> {
  const collection = await getConfigCollectionFR();

  const cursor = collection.find({ isEnabled: true });

  return cursor.toArray();
}

/**
 * Delete auto-generation config for French videos
 */
export async function deleteAutoGenerationConfigFR(userId: string): Promise<boolean> {
  const collection = await getConfigCollectionFR();

  const result = await collection.deleteOne({ userId });

  return result.deletedCount > 0;
}

/**
 * Update config stats for French videos
 */
export async function updateConfigStatsFR(
  configId: ObjectId,
  updates: Partial<AutoGenerationStatsFR>
): Promise<void> {
  const collection = await getConfigCollectionFR();

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
 * Increment totalGenerated counter for French videos
 */
export async function incrementGeneratedCountFR(configId: ObjectId): Promise<void> {
  const collection = await getConfigCollectionFR();

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
 * Create a new auto-generation job for French videos
 */
export async function createAutoGenerationJobFR(
  job: Omit<AutoGenerationJobFR, "_id" | "createdAt">
): Promise<AutoGenerationJobFR> {
  const collection = await getQueueCollectionFR();

  const newJob: AutoGenerationJobFR = {
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
 * Update job status for French videos
 */
export async function updateJobStatusFR(
  jobId: ObjectId,
  status: AutoGenerationJobFR["status"],
  updates?: {
    errorMessage?: string;
    results?: AutoGenerationJobFR["results"];
  }
): Promise<void> {
  const collection = await getQueueCollectionFR();

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
 * Get jobs by user ID and optional filters for French videos
 */
export async function getJobsByUserFR(
  userId: string,
  options?: {
    status?: AutoGenerationJobFR["status"];
    limit?: number;
  }
): Promise<AutoGenerationJobFR[]> {
  const collection = await getQueueCollectionFR();

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
 * Get jobs created today for a specific user (French videos)
 */
export async function getJobsByDateFR(
  userId: string,
  date: Date
): Promise<AutoGenerationJobFR[]> {
  const collection = await getQueueCollectionFR();

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
 * Increment retry count for a job (French videos)
 */
export async function incrementJobRetryCountFR(jobId: ObjectId): Promise<void> {
  const collection = await getQueueCollectionFR();

  await collection.updateOne(
    { _id: jobId },
    { $inc: { retryCount: 1 } }
  );
}
