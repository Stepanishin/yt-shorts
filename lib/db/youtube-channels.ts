import { ObjectId, Collection, Document } from "mongodb";
import { getMongoDatabase } from "./mongodb";

const COLLECTION_NAME = "youtube_channels";

export interface YouTubeChannelCredentials {
  _id?: ObjectId;
  userId: string; // User's googleId
  channelId: string; // YouTube channel ID (e.g., UC52X2hnAZu7FjTTHHD2YWhw)
  channelTitle: string; // Channel name for display
  channelThumbnail?: string; // Channel thumbnail URL
  accessToken: string; // Encrypted
  refreshToken?: string; // Encrypted
  tokenExpiresAt?: Date;
  clientId: string; // OAuth client ID used
  clientSecret: string; // Encrypted OAuth client secret
  youtubeProject?: 1 | 2; // Which YouTube API project was used
  isDefault?: boolean; // Is this the default channel for publishing
  createdAt: Date;
  updatedAt: Date;
}

const ensureIndexes = async (collection: Collection<YouTubeChannelCredentials & Document>) => {
  await collection.createIndex({ userId: 1 });
  await collection.createIndex({ userId: 1, channelId: 1 }, { unique: true });
  await collection.createIndex({ userId: 1, isDefault: 1 });
};

const getCollection = async (): Promise<Collection<YouTubeChannelCredentials & Document>> => {
  const db = await getMongoDatabase();
  const collection = db.collection<YouTubeChannelCredentials>(COLLECTION_NAME);
  await ensureIndexes(collection);
  return collection;
};

/**
 * Get all YouTube channels for a user
 */
export async function getYouTubeChannels(userId: string): Promise<YouTubeChannelCredentials[]> {
  const collection = await getCollection();
  const channels = await collection.find({ userId }).sort({ isDefault: -1, createdAt: 1 }).toArray();
  return channels;
}

/**
 * Get a specific YouTube channel by channelId
 */
export async function getYouTubeChannelByChannelId(
  userId: string,
  channelId: string
): Promise<YouTubeChannelCredentials | null> {
  const collection = await getCollection();
  return collection.findOne({ userId, channelId });
}

/**
 * Get a YouTube channel by its MongoDB _id
 */
export async function getYouTubeChannelById(id: string): Promise<YouTubeChannelCredentials | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: new ObjectId(id) });
}

/**
 * Get the default YouTube channel for a user
 */
export async function getDefaultYouTubeChannel(userId: string): Promise<YouTubeChannelCredentials | null> {
  const collection = await getCollection();
  // First try to find the default channel
  let channel = await collection.findOne({ userId, isDefault: true });
  // If no default, return the first channel
  if (!channel) {
    channel = await collection.findOne({ userId });
  }
  return channel;
}

/**
 * Add a new YouTube channel (or update if exists)
 */
export async function upsertYouTubeChannel(
  data: Omit<YouTubeChannelCredentials, "_id" | "createdAt" | "updatedAt">
): Promise<YouTubeChannelCredentials> {
  const collection = await getCollection();
  const now = new Date();

  // If this is marked as default, remove default from other channels
  if (data.isDefault) {
    await collection.updateMany(
      { userId: data.userId, channelId: { $ne: data.channelId } },
      { $set: { isDefault: false, updatedAt: now } }
    );
  }

  const result = await collection.findOneAndUpdate(
    { userId: data.userId, channelId: data.channelId },
    {
      $set: {
        ...data,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  if (!result) {
    throw new Error("Failed to upsert YouTube channel");
  }

  return result;
}

/**
 * Update YouTube channel tokens
 */
export async function updateYouTubeChannelTokens(
  userId: string,
  channelId: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
  }
): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    { userId, channelId },
    {
      $set: {
        ...tokens,
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Set a channel as default
 */
export async function setDefaultYouTubeChannel(userId: string, channelId: string): Promise<void> {
  const collection = await getCollection();
  const now = new Date();

  // Remove default from all channels
  await collection.updateMany({ userId }, { $set: { isDefault: false, updatedAt: now } });

  // Set the specified channel as default
  await collection.updateOne({ userId, channelId }, { $set: { isDefault: true, updatedAt: now } });
}

/**
 * Delete a YouTube channel
 */
export async function deleteYouTubeChannel(userId: string, channelId: string): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.deleteOne({ userId, channelId });
  return result.deletedCount > 0;
}

/**
 * Check if user has any YouTube channels
 */
export async function hasYouTubeChannels(userId: string): Promise<boolean> {
  const collection = await getCollection();
  const count = await collection.countDocuments({ userId });
  return count > 0;
}
