import { ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";

export interface PublishTime {
  id: string;
  hour: number;
  minute: number;
  isEnabled: boolean;
}

export interface NewsGenerationTemplate {
  celebrityImage: {
    height: number;
    objectFit: "cover" | "contain";
    position: "top" | "center";
  };
  newsText: {
    title: {
      fontSize: number;
      color: string;
      fontWeight: "normal" | "bold";
      y: number;
      lineSpacing: number;
    };
    summary: {
      fontSize: number;
      color: string;
      fontWeight: "normal" | "bold";
      y: number;
      lineSpacing: number;
    };
    backgroundColor: string;
    width: number;
    padding: number;
  };
  audio?: {
    urls: string[];
    randomTrim: boolean;
    duration: number;
  };
}

export interface YouTubeNewsSettings {
  privacyStatus: "public" | "private" | "unlisted";
  tags: string[];
  titleTemplate?: string;
  descriptionTemplate?: string;
  useAI: boolean;
  channelId?: string;
  manualChannelId?: string;
  savedChannelId?: string;
}

export interface NewsAutoGenerationStats {
  totalGenerated: number;
  totalPublished: number;
  lastGeneratedAt?: Date;
  lastPublishedAt?: Date;
}

export interface NewsIngestSchedule {
  hour: number;
  minute: number;
  isEnabled: boolean;
}

export interface NewsAutoGenerationConfigSL {
  _id?: ObjectId;
  userId: string;
  isEnabled: boolean;
  videosPerDay: number;
  publishTimes: PublishTime[];
  newsIngestSchedule?: NewsIngestSchedule;
  blackAndWhitePhoto?: boolean;
  selectedTemplate?: "template1" | "template2";
  template: NewsGenerationTemplate;
  youtube: YouTubeNewsSettings;
  stats: NewsAutoGenerationStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewsAutoGenerationJobSL {
  _id?: ObjectId;
  userId: string;
  configId: string;
  status: "pending" | "processing" | "completed" | "failed";

  newsId: string;
  newsTitle: string;
  newsSummary: string;
  newsImageUrl: string;

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

const CONFIG_COLLECTION = "auto_generation_configs_news_sl";
const QUEUE_COLLECTION = "auto_generation_queue_news_sl";

async function getConfigCollection() {
  const db = await getMongoDatabase();
  return db.collection<NewsAutoGenerationConfigSL>(CONFIG_COLLECTION);
}

async function getQueueCollection() {
  const db = await getMongoDatabase();
  return db.collection<NewsAutoGenerationJobSL>(QUEUE_COLLECTION);
}

export async function saveNewsAutoGenerationConfigSL(
  config: Omit<NewsAutoGenerationConfigSL, "_id" | "createdAt" | "updatedAt"> & { _id?: ObjectId }
): Promise<NewsAutoGenerationConfigSL> {
  const collection = await getConfigCollection();

  const now = new Date();

  if (config._id) {
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
    const newConfig: NewsAutoGenerationConfigSL = {
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

export async function getNewsAutoGenerationConfigSL(
  userId: string
): Promise<NewsAutoGenerationConfigSL | null> {
  const collection = await getConfigCollection();
  return collection.findOne({ userId });
}

export async function getActiveNewsAutoGenerationConfigsSL(): Promise<NewsAutoGenerationConfigSL[]> {
  const collection = await getConfigCollection();
  return collection.find({ isEnabled: true }).toArray();
}

export async function deleteNewsAutoGenerationConfigSL(userId: string): Promise<boolean> {
  const collection = await getConfigCollection();
  const result = await collection.deleteOne({ userId });
  return result.deletedCount > 0;
}

export async function updateNewsConfigStatsSL(
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

export async function incrementNewsGeneratedCountSL(configId: ObjectId): Promise<void> {
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

export async function createNewsAutoGenerationJobSL(
  job: Omit<NewsAutoGenerationJobSL, "_id" | "createdAt">
): Promise<NewsAutoGenerationJobSL> {
  const collection = await getQueueCollection();

  const newJob: NewsAutoGenerationJobSL = {
    ...job,
    createdAt: new Date(),
  };

  const result = await collection.insertOne(newJob as any);

  return {
    ...newJob,
    _id: result.insertedId,
  };
}

export async function updateNewsJobStatusSL(
  jobId: ObjectId,
  status: NewsAutoGenerationJobSL["status"],
  updates?: {
    errorMessage?: string;
    results?: NewsAutoGenerationJobSL["results"];
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

export async function getNewsJobsByUserSL(
  userId: string,
  options?: {
    status?: NewsAutoGenerationJobSL["status"];
    limit?: number;
  }
): Promise<NewsAutoGenerationJobSL[]> {
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

export async function getNewsJobsByDateSL(
  userId: string,
  date: Date
): Promise<NewsAutoGenerationJobSL[]> {
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

export async function incrementNewsJobRetryCountSL(jobId: ObjectId): Promise<void> {
  const collection = await getQueueCollection();

  await collection.updateOne(
    { _id: jobId },
    { $inc: { retryCount: 1 } }
  );
}
