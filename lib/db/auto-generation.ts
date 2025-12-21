import { MongoClient, Db, ObjectId } from "mongodb";
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

export interface AutoGenerationTemplate {
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

export interface YouTubeAutoSettings {
  privacyStatus: "public" | "private" | "unlisted";
  tags: string[];
  titleTemplate?: string; // Template with variables like {joke}
  descriptionTemplate?: string;
  useAI: boolean; // Generate title/description via AI
  channelId?: string; // Optional: specific YouTube channel ID (if user has multiple channels)
}

export interface AutoGenerationStats {
  totalGenerated: number;
  totalPublished: number;
  lastGeneratedAt?: Date;
  lastPublishedAt?: Date;
}

export interface AutoGenerationConfig {
  _id?: ObjectId;
  userId: string; // Reference to User._id or googleId
  isEnabled: boolean;
  videosPerDay: number; // 1-10 videos per day
  publishTimes: PublishTime[];
  template: AutoGenerationTemplate;
  youtube: YouTubeAutoSettings;
  stats: AutoGenerationStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutoGenerationJob {
  _id?: ObjectId;
  userId: string;
  configId: string; // Reference to AutoGenerationConfig._id
  status: "pending" | "processing" | "completed" | "failed";

  // Generation data
  jokeId: string; // ID from joke_candidates collection
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

const CONFIG_COLLECTION = "auto_generation_configs";
const QUEUE_COLLECTION = "auto_generation_queue";

async function getConfigCollection() {
  const db = await getMongoDatabase();
  return db.collection<AutoGenerationConfig>(CONFIG_COLLECTION);
}

async function getQueueCollection() {
  const db = await getMongoDatabase();
  return db.collection<AutoGenerationJob>(QUEUE_COLLECTION);
}

// ============================================
// Config CRUD Functions
// ============================================

/**
 * Create or update auto-generation configuration
 */
export async function saveAutoGenerationConfig(
  config: Omit<AutoGenerationConfig, "_id" | "createdAt" | "updatedAt"> & { _id?: ObjectId }
): Promise<AutoGenerationConfig> {
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
      throw new Error(`Config with ID ${config._id} not found`);
    }

    return result;
  } else {
    // Create new config
    const newConfig: AutoGenerationConfig = {
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
 * Get auto-generation config by user ID
 */
export async function getAutoGenerationConfig(
  userId: string
): Promise<AutoGenerationConfig | null> {
  const collection = await getConfigCollection();

  const config = await collection.findOne({ userId });

  return config;
}

/**
 * Get all active auto-generation configs (isEnabled=true)
 */
export async function getActiveAutoGenerationConfigs(): Promise<AutoGenerationConfig[]> {
  const collection = await getConfigCollection();

  const cursor = collection.find({ isEnabled: true });

  return cursor.toArray();
}

/**
 * Delete auto-generation config
 */
export async function deleteAutoGenerationConfig(userId: string): Promise<boolean> {
  const collection = await getConfigCollection();

  const result = await collection.deleteOne({ userId });

  return result.deletedCount > 0;
}

/**
 * Update config stats
 */
export async function updateConfigStats(
  configId: ObjectId,
  updates: Partial<AutoGenerationStats>
): Promise<void> {
  const collection = await getConfigCollection();

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
 * Increment totalGenerated counter
 */
export async function incrementGeneratedCount(configId: ObjectId): Promise<void> {
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
// Job CRUD Functions
// ============================================

/**
 * Create a new auto-generation job
 */
export async function createAutoGenerationJob(
  job: Omit<AutoGenerationJob, "_id" | "createdAt">
): Promise<AutoGenerationJob> {
  const collection = await getQueueCollection();

  const newJob: AutoGenerationJob = {
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
 * Update job status
 */
export async function updateJobStatus(
  jobId: ObjectId,
  status: AutoGenerationJob["status"],
  updates?: {
    errorMessage?: string;
    results?: AutoGenerationJob["results"];
  }
): Promise<void> {
  const collection = await getQueueCollection();

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
 * Get jobs by user ID and optional filters
 */
export async function getJobsByUser(
  userId: string,
  options?: {
    status?: AutoGenerationJob["status"];
    limit?: number;
  }
): Promise<AutoGenerationJob[]> {
  const collection = await getQueueCollection();

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
 * Get jobs created today for a specific user
 */
export async function getJobsByDate(
  userId: string,
  date: Date
): Promise<AutoGenerationJob[]> {
  const collection = await getQueueCollection();

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
 * Increment retry count for a job
 */
export async function incrementJobRetryCount(jobId: ObjectId): Promise<void> {
  const collection = await getQueueCollection();

  await collection.updateOne(
    { _id: jobId },
    { $inc: { retryCount: 1 } }
  );
}
