import { MongoClient, Db, ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";

// ============================================
// TypeScript Interfaces
// ============================================

export interface PublishTimePT {
  id: string;
  hour: number; // 0-23
  minute: number; // 0-59
  isEnabled: boolean;
}

export interface AutoGenerationTemplatePT {
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

export interface YouTubeAutoSettingsPT {
  privacyStatus: "public" | "private" | "unlisted";
  tags: string[];
  titleTemplate?: string; // Template with variables like {joke}
  descriptionTemplate?: string;
  useAI: boolean; // Generate title/description via AI (in Portuguese)
  channelId?: string; // Optional: specific YouTube channel ID (if user has multiple channels)
}

export interface AutoGenerationStatsPT {
  totalGenerated: number;
  totalPublished: number;
  lastGeneratedAt?: Date;
  lastPublishedAt?: Date;
}

export interface AutoGenerationConfigPT {
  _id?: ObjectId;
  userId: string; // Reference to User._id or googleId
  isEnabled: boolean;
  videosPerDay: number; // 1-10 videos per day
  publishTimes: PublishTimePT[];
  template: AutoGenerationTemplatePT;
  youtube: YouTubeAutoSettingsPT;
  stats: AutoGenerationStatsPT;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutoGenerationJobPT {
  _id?: ObjectId;
  userId: string;
  configId: string; // Reference to AutoGenerationConfigPT._id
  status: "pending" | "processing" | "completed" | "failed";

  // Generation data
  jokeId: string; // ID from joke_candidates_pt collection
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

const CONFIG_COLLECTION_PT = "auto_generation_configs_pt";
const QUEUE_COLLECTION_PT = "auto_generation_queue_pt";

async function getConfigCollectionPT() {
  const db = await getMongoDatabase();
  return db.collection<AutoGenerationConfigPT>(CONFIG_COLLECTION_PT);
}

async function getQueueCollectionPT() {
  const db = await getMongoDatabase();
  return db.collection<AutoGenerationJobPT>(QUEUE_COLLECTION_PT);
}

// ============================================
// Config CRUD Functions
// ============================================

/**
 * Create or update auto-generation configuration for Portuguese videos
 */
export async function saveAutoGenerationConfigPT(
  config: Omit<AutoGenerationConfigPT, "_id" | "createdAt" | "updatedAt"> & { _id?: ObjectId }
): Promise<AutoGenerationConfigPT> {
  const collection = await getConfigCollectionPT();

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
    const newConfig: AutoGenerationConfigPT = {
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
 * Get auto-generation config by user ID for Portuguese videos
 */
export async function getAutoGenerationConfigPT(
  userId: string
): Promise<AutoGenerationConfigPT | null> {
  const collection = await getConfigCollectionPT();

  const config = await collection.findOne({ userId });

  return config;
}

/**
 * Get all active auto-generation configs for Portuguese videos (isEnabled=true)
 */
export async function getActiveAutoGenerationConfigsPT(): Promise<AutoGenerationConfigPT[]> {
  const collection = await getConfigCollectionPT();

  const cursor = collection.find({ isEnabled: true });

  return cursor.toArray();
}

/**
 * Delete auto-generation config for Portuguese videos
 */
export async function deleteAutoGenerationConfigPT(userId: string): Promise<boolean> {
  const collection = await getConfigCollectionPT();

  const result = await collection.deleteOne({ userId });

  return result.deletedCount > 0;
}

/**
 * Update config stats for Portuguese videos
 */
export async function updateConfigStatsPT(
  configId: ObjectId,
  updates: Partial<AutoGenerationStatsPT>
): Promise<void> {
  const collection = await getConfigCollectionPT();

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
 * Increment totalGenerated counter for Portuguese videos
 */
export async function incrementGeneratedCountPT(configId: ObjectId): Promise<void> {
  const collection = await getConfigCollectionPT();

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
 * Create a new auto-generation job for Portuguese videos
 */
export async function createAutoGenerationJobPT(
  job: Omit<AutoGenerationJobPT, "_id" | "createdAt">
): Promise<AutoGenerationJobPT> {
  const collection = await getQueueCollectionPT();

  const newJob: AutoGenerationJobPT = {
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
 * Update job status for Portuguese videos
 */
export async function updateJobStatusPT(
  jobId: ObjectId,
  status: AutoGenerationJobPT["status"],
  updates?: {
    errorMessage?: string;
    results?: AutoGenerationJobPT["results"];
  }
): Promise<void> {
  const collection = await getQueueCollectionPT();

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
 * Get jobs by user ID and optional filters for Portuguese videos
 */
export async function getJobsByUserPT(
  userId: string,
  options?: {
    status?: AutoGenerationJobPT["status"];
    limit?: number;
  }
): Promise<AutoGenerationJobPT[]> {
  const collection = await getQueueCollectionPT();

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
 * Get jobs created today for a specific user (Portuguese videos)
 */
export async function getJobsByDatePT(
  userId: string,
  date: Date
): Promise<AutoGenerationJobPT[]> {
  const collection = await getQueueCollectionPT();

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
 * Increment retry count for a job (Portuguese videos)
 */
export async function incrementJobRetryCountPT(jobId: ObjectId): Promise<void> {
  const collection = await getQueueCollectionPT();

  await collection.updateOne(
    { _id: jobId },
    { $inc: { retryCount: 1 } }
  );
}
