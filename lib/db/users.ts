import { MongoClient, Db, ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";
import { createTransaction, TransactionReason } from "./transactions";

export interface YouTubeSettings {
  clientId: string;
  clientSecret: string; // Encrypted
  redirectUri: string;
  accessToken?: string; // Encrypted
  refreshToken?: string; // Encrypted
  tokenExpiresAt?: Date;
  defaultPrivacyStatus?: "public" | "private" | "unlisted";
  defaultTags?: string[];
  channelId?: string;
  youtubeProject?: 1 | 2; // YouTube API Project selector (1 = default, 2 = additional quota)
}

export interface ScheduledVideo {
  id: string; // Уникальный ID запланированного видео
  videoUrl: string; // URL видео на сервере/S3
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "public" | "private" | "unlisted";
  scheduledAt: Date; // Дата и время публикации
  status: "planned" | "publishing" | "published" | "failed";
  createdAt: Date;
  publishedAt?: Date;
  youtubeVideoId?: string;
  youtubeVideoUrl?: string;
  errorMessage?: string;
  jokeId?: string; // ID анекдота, если видео создано из анекдота
  newsId?: string; // ID новости, если видео создано из новости
  memeId?: string; // ID мема, если видео создано из Reddit мема
  language?: "es" | "de" | "pt" | "fr" | "en" | "sl";
  youtubeChannelId?: string; // Optional: specific YouTube channel ID (if user has multiple channels)
  thumbnailUrl?: string; // Optional: custom thumbnail URL/path for longform videos
  categoryId?: string; // YouTube category ID (e.g. "24" = Entertainment, "25" = News & Politics)
  commentText?: string; // Optional: comment to post from the channel right after publishing (engagement)
  publishingStartedAt?: Date; // When the status switched to "publishing" — used to recover stuck publishes
  retryCount?: number; // Publish retry attempts (retryable errors re-plan the video up to a limit)
}

export interface User {
  _id?: ObjectId;
  googleId: string;
  email: string;
  name: string;
  image?: string;
  credits: number; // 1 credit = 1 euro cent
  isAdmin?: boolean; // Флаг администратора (опционально)
  youtubeSettings?: YouTubeSettings;
  scheduledVideos?: ScheduledVideo[]; // Запланированные видео для публикации
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = "users";

export async function getUserByGoogleId(googleId: string): Promise<User | null> {
  const db = await getMongoDatabase();
  const user = await db.collection<User>(COLLECTION_NAME).findOne({ googleId });
  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getMongoDatabase();
  const user = await db.collection<User>(COLLECTION_NAME).findOne({ email });
  return user;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getMongoDatabase();
  const user = await db.collection<User>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
  return user;
}

export async function createUser(userData: Omit<User, "_id" | "createdAt" | "updatedAt">): Promise<User> {
  const db = await getMongoDatabase();

  const newUser: Omit<User, "_id"> = {
    ...userData,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection<User>(COLLECTION_NAME).insertOne(newUser as User);

  return {
    ...newUser,
    _id: result.insertedId,
  };
}

export async function updateUser(id: string, userData: Partial<User>): Promise<User | null> {
  const db = await getMongoDatabase();

  const result = await db.collection<User>(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(id) },
    {
      $set: {
        ...userData,
        updatedAt: new Date()
      }
    },
    { returnDocument: "after" }
  );

  return result || null;
}

export async function upsertUserByGoogleId(
  googleId: string,
  userData: Omit<User, "_id" | "googleId" | "createdAt" | "updatedAt" | "credits">
): Promise<User> {
  const db = await getMongoDatabase();

  // Проверяем, существует ли пользователь
  const existingUser = await getUserByGoogleId(googleId);
  const isNewUser = !existingUser;

  const result = await db.collection<User>(COLLECTION_NAME).findOneAndUpdate(
    { googleId },
    {
      $set: {
        ...userData,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        googleId,
        credits: 50, // Начальный баланс 50 кредитов
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
      returnDocument: "after",
    }
  );

  if (!result) {
    throw new Error("Failed to upsert user");
  }

  // Логируем начальный баланс только для новых пользователей
  if (isNewUser && result.credits === 50) {
    try {
      await createTransaction(
        result._id!.toString(),
        "deposit",
        50,
        "initial_balance",
        0,
        50,
        "Начальный баланс при регистрации"
      );
    } catch (error) {
      console.error("Failed to log initial balance transaction:", error);
      // Не прерываем выполнение, если логирование не удалось
    }
  }

  return result;
}

export async function addCredits(
  userId: string,
  amount: number,
  reason: TransactionReason = "purchase",
  description?: string,
  metadata?: Record<string, unknown>
): Promise<User | null> {
  const db = await getMongoDatabase();

  // Получаем текущий баланс
  const userBefore = await getUserById(userId);
  const balanceBefore = userBefore?.credits || 0;

  const result = await db.collection<User>(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(userId) },
    {
      $inc: { credits: amount },
      $set: { updatedAt: new Date() }
    },
    { returnDocument: "after" }
  );

  if (result) {
    // Логируем транзакцию
    try {
      await createTransaction(
        userId,
        "deposit",
        amount,
        reason,
        balanceBefore,
        result.credits,
        description,
        metadata
      );
    } catch (error) {
      console.error("Failed to log transaction:", error);
      // Не прерываем выполнение, если логирование не удалось
    }
  }

  return result || null;
}

export async function deductCredits(
  userId: string,
  amount: number,
  reason: TransactionReason = "video_generation",
  description?: string,
  metadata?: Record<string, unknown>
): Promise<User | null> {
  console.log("🔍 deductCredits called with:", { userId, amount });

  const db = await getMongoDatabase();

  // Проверяем, что у пользователя достаточно кредитов
  const user = await getUserById(userId);
  console.log("👤 User found:", {
    hasUser: !!user,
    credits: user?.credits,
    creditsType: typeof user?.credits,
    email: user?.email
  });

  if (!user) {
    console.error("❌ User not found!");
    throw new Error("User not found");
  }

  if (user.credits === undefined) {
    console.error("❌ User has no credits field!");
    throw new Error("User credits field not initialized");
  }

  if (user.credits < amount) {
    console.error("❌ Insufficient credits:", { has: user.credits, needs: amount });
    throw new Error("Insufficient credits");
  }

  console.log("✅ User has sufficient credits, proceeding with deduction...");

  const balanceBefore = user.credits;

  const result = await db.collection<User>(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(userId), credits: { $gte: amount } },
    {
      $inc: { credits: -amount },
      $set: { updatedAt: new Date() }
    },
    { returnDocument: "after" }
  );

  if (!result) {
    console.error("❌ Failed to deduct credits from database");
    throw new Error("Failed to deduct credits");
  }

  console.log("✅ Credits deducted successfully, new balance:", result.credits);

  // Логируем транзакцию
  try {
    await createTransaction(
      userId,
      "withdrawal",
      amount,
      reason,
      balanceBefore,
      result.credits,
      description,
      metadata
    );
  } catch (error) {
    console.error("Failed to log transaction:", error);
    // Не прерываем выполнение, если логирование не удалось
  }

  return result;
}

// ============ Scheduled Videos Management ============

export async function addScheduledVideo(
  userId: string,
  video: Omit<ScheduledVideo, "id" | "createdAt" | "status">
): Promise<ScheduledVideo> {
  const db = await getMongoDatabase();

  const scheduledVideo: ScheduledVideo = {
    ...video,
    id: new ObjectId().toString(),
    createdAt: new Date(),
    status: "planned",
  };

  // Поддерживаем как ObjectId так и другие форматы userId
  const query = ObjectId.isValid(userId)
    ? { _id: new ObjectId(userId) }
    : { googleId: userId };

  await db.collection<User>(COLLECTION_NAME).updateOne(
    query,
    {
      $push: { scheduledVideos: scheduledVideo } as any,
      $set: { updatedAt: new Date() }
    }
  );

  return scheduledVideo;
}

export async function getScheduledVideos(userId: string): Promise<ScheduledVideo[]> {
  const db = await getMongoDatabase();

  // Поддерживаем как ObjectId так и другие форматы userId
  const query = ObjectId.isValid(userId)
    ? { _id: new ObjectId(userId) }
    : { googleId: userId };

  const user = await db.collection<User>(COLLECTION_NAME).findOne(query);
  return user?.scheduledVideos || [];
}

export async function updateScheduledVideoStatus(
  userId: string,
  videoId: string,
  status: ScheduledVideo["status"],
  updates?: Partial<Pick<ScheduledVideo, "publishedAt" | "youtubeVideoId" | "youtubeVideoUrl" | "errorMessage" | "scheduledAt" | "retryCount">>
): Promise<void> {
  const db = await getMongoDatabase();

  const updateFields: any = {
    "scheduledVideos.$.status": status,
    updatedAt: new Date(),
  };

  if (status === "publishing") {
    updateFields["scheduledVideos.$.publishingStartedAt"] = new Date();
  }

  if (updates) {
    if (updates.publishedAt) updateFields["scheduledVideos.$.publishedAt"] = updates.publishedAt;
    if (updates.youtubeVideoId) updateFields["scheduledVideos.$.youtubeVideoId"] = updates.youtubeVideoId;
    if (updates.youtubeVideoUrl) updateFields["scheduledVideos.$.youtubeVideoUrl"] = updates.youtubeVideoUrl;
    if (updates.errorMessage) updateFields["scheduledVideos.$.errorMessage"] = updates.errorMessage;
    if (updates.scheduledAt) updateFields["scheduledVideos.$.scheduledAt"] = updates.scheduledAt;
    if (updates.retryCount !== undefined) updateFields["scheduledVideos.$.retryCount"] = updates.retryCount;
  }

  // Поддерживаем как ObjectId так и другие форматы userId
  const userQuery = ObjectId.isValid(userId)
    ? { _id: new ObjectId(userId) }
    : { googleId: userId };

  await db.collection<User>(COLLECTION_NAME).updateOne(
    { ...userQuery, "scheduledVideos.id": videoId },
    { $set: updateFields }
  );
}

export async function deleteScheduledVideo(userId: string, videoId: string): Promise<void> {
  const db = await getMongoDatabase();

  // Поддерживаем как ObjectId так и другие форматы userId
  const query = ObjectId.isValid(userId)
    ? { _id: new ObjectId(userId) }
    : { googleId: userId };

  await db.collection<User>(COLLECTION_NAME).updateOne(
    query,
    {
      $pull: { scheduledVideos: { id: videoId } } as any,
      $set: { updatedAt: new Date() }
    }
  );
}

// A video stuck in "publishing" longer than this is considered crashed and gets retried
const STUCK_PUBLISHING_MS = 30 * 60 * 1000;

export async function getScheduledVideosForPublishing(): Promise<Array<{ userId: string; video: ScheduledVideo; user: User }>> {
  const db = await getMongoDatabase();

  const now = new Date();
  const stuckBefore = new Date(now.getTime() - STUCK_PUBLISHING_MS);

  // Находим всех пользователей, у которых есть запланированные видео, готовые к публикации,
  // либо зависшие в "publishing" (процесс умер во время загрузки)
  const users = await db.collection<User>(COLLECTION_NAME).find({
    scheduledVideos: {
      $elemMatch: {
        $or: [
          { status: "planned", scheduledAt: { $lte: now } },
          { status: "publishing", publishingStartedAt: { $lte: stuckBefore } },
          // Records stuck before publishingStartedAt existed
          { status: "publishing", publishingStartedAt: { $exists: false } },
        ],
      }
    }
  }).toArray();

  const result: Array<{ userId: string; video: ScheduledVideo; user: User }> = [];

  for (const user of users) {
    if (user.scheduledVideos) {
      for (const video of user.scheduledVideos) {
        const isDue = video.status === "planned" && new Date(video.scheduledAt) <= now;
        const isStuck =
          video.status === "publishing" &&
          (!video.publishingStartedAt || new Date(video.publishingStartedAt) <= stuckBefore);

        if (isDue || isStuck) {
          if (isStuck) {
            console.log(`⚠️ Recovering video ${video.id} stuck in "publishing" since ${video.publishingStartedAt ? new Date(video.publishingStartedAt).toISOString() : "unknown time"}`);
          }
          result.push({
            userId: user._id!.toString(),
            video,
            user // Передаем весь объект пользователя, чтобы не делать повторный запрос
          });
        }
      }
    }
  }

  return result;
}
