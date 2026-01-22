import { ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";

// ============================================
// TypeScript Interfaces for News Auto-Generation
// ============================================

export interface PublishTime {
  id: string;
  hour: number; // 0-23
  minute: number; // 0-59
  isEnabled: boolean;
}

export interface NewsGenerationTemplate {
  celebrityImage: {
    height: number; // Top 1/3 of screen (427px for 720x1280)
    objectFit: "cover" | "contain";
    position: "top" | "center";
  };
  newsText: {
    title: {
      fontSize: number;
      color: string; // Format: "black@1"
      fontWeight: "normal" | "bold";
      y: number; // Y position
      lineSpacing: number;
    };
    summary: {
      fontSize: number;
      color: string; // Format: "black@1"
      fontWeight: "normal" | "bold";
      y: number; // Y position
      lineSpacing: number;
    };
    backgroundColor: string; // Format: "white@1"
    width: number; // Text width with padding
    padding: number;
  };
  audio?: {
    urls: string[]; // Optional background music
    randomTrim: boolean;
    duration: number; // Target duration in seconds
  };
}

export interface YouTubeNewsSettings {
  privacyStatus: "public" | "private" | "unlisted";
  tags: string[];
  titleTemplate?: string; // Template with variables like {title}
  descriptionTemplate?: string;
  useAI: boolean; // Generate title/description via AI
  channelId?: string; // Optional: specific YouTube channel ID
  manualChannelId?: string; // Optional: manually entered Channel ID (for Brand Accounts)
  savedChannelId?: string; // Optional: select from saved channels. Highest priority.
}

export interface NewsAutoGenerationStats {
  totalGenerated: number;
  totalPublished: number;
  lastGeneratedAt?: Date;
  lastPublishedAt?: Date;
}

export interface NewsIngestSchedule {
  hour: number; // 0-23 - время запуска скрапинга
  minute: number; // 0-59
  isEnabled: boolean; // Включен ли автоматический скрапинг
}

export interface NewsAutoGenerationConfig {
  _id?: ObjectId;
  userId: string; // Reference to User._id or googleId
  isEnabled: boolean;
  videosPerDay: number; // 6-10 videos per day
  publishTimes: PublishTime[];
  newsIngestSchedule?: NewsIngestSchedule; // Время автоматического скрапинга новостей
  template: NewsGenerationTemplate;
  youtube: YouTubeNewsSettings;
  stats: NewsAutoGenerationStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewsAutoGenerationJob {
  _id?: ObjectId;
  userId: string;
  configId: string; // Reference to NewsAutoGenerationConfig._id
  status: "pending" | "processing" | "completed" | "failed";

  // Generation data
  newsId: string; // ID from news_candidates_es collection
  newsTitle: string; // Saved news title
  newsSummary: string; // Saved news summary
  newsImageUrl: string; // Celebrity image URL

  // Selected resources
  selectedResources: {
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

const CONFIG_COLLECTION = "auto_generation_configs_news";
const QUEUE_COLLECTION = "auto_generation_queue_news";

async function getConfigCollection() {
  const db = await getMongoDatabase();
  return db.collection<NewsAutoGenerationConfig>(CONFIG_COLLECTION);
}

async function getQueueCollection() {
  const db = await getMongoDatabase();
  return db.collection<NewsAutoGenerationJob>(QUEUE_COLLECTION);
}

// ============================================
// Config CRUD Functions
// ============================================

/**
 * Create or update news auto-generation configuration
 */
export async function saveNewsAutoGenerationConfig(
  config: Omit<NewsAutoGenerationConfig, "_id" | "createdAt" | "updatedAt"> & { _id?: ObjectId }
): Promise<NewsAutoGenerationConfig> {
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
    const newConfig: NewsAutoGenerationConfig = {
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
 * Get news auto-generation config by user ID
 */
export async function getNewsAutoGenerationConfig(
  userId: string
): Promise<NewsAutoGenerationConfig | null> {
  const collection = await getConfigCollection();

  const config = await collection.findOne({ userId });

  return config;
}

/**
 * Get all active news auto-generation configs (isEnabled=true)
 */
export async function getActiveNewsAutoGenerationConfigs(): Promise<NewsAutoGenerationConfig[]> {
  const collection = await getConfigCollection();

  const cursor = collection.find({ isEnabled: true });

  return cursor.toArray();
}

/**
 * Delete news auto-generation config
 */
export async function deleteNewsAutoGenerationConfig(userId: string): Promise<boolean> {
  const collection = await getConfigCollection();

  const result = await collection.deleteOne({ userId });

  return result.deletedCount > 0;
}

/**
 * Update config stats
 */
export async function updateNewsConfigStats(
  configId: ObjectId,
  updates: Partial<NewsAutoGenerationStats>
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
export async function incrementNewsGeneratedCount(configId: ObjectId): Promise<void> {
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
 * Create a new news auto-generation job
 */
export async function createNewsAutoGenerationJob(
  job: Omit<NewsAutoGenerationJob, "_id" | "createdAt">
): Promise<NewsAutoGenerationJob> {
  const collection = await getQueueCollection();

  const newJob: NewsAutoGenerationJob = {
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
export async function updateNewsJobStatus(
  jobId: ObjectId,
  status: NewsAutoGenerationJob["status"],
  updates?: {
    errorMessage?: string;
    results?: NewsAutoGenerationJob["results"];
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
export async function getNewsJobsByUser(
  userId: string,
  options?: {
    status?: NewsAutoGenerationJob["status"];
    limit?: number;
  }
): Promise<NewsAutoGenerationJob[]> {
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
export async function getNewsJobsByDate(
  userId: string,
  date: Date
): Promise<NewsAutoGenerationJob[]> {
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
export async function incrementNewsJobRetryCount(jobId: ObjectId): Promise<void> {
  const collection = await getQueueCollection();

  await collection.updateOne(
    { _id: jobId },
    { $inc: { retryCount: 1 } }
  );
}
