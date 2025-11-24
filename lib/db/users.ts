import { MongoClient, Db, ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";

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
}

export interface User {
  _id?: ObjectId;
  googleId: string;
  email: string;
  name: string;
  image?: string;
  credits: number; // 1 credit = 1 euro cent
  youtubeSettings?: YouTubeSettings;
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

  return result;
}

export async function addCredits(userId: string, amount: number): Promise<User | null> {
  const db = await getMongoDatabase();

  const result = await db.collection<User>(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(userId) },
    {
      $inc: { credits: amount },
      $set: { updatedAt: new Date() }
    },
    { returnDocument: "after" }
  );

  return result || null;
}

export async function deductCredits(userId: string, amount: number): Promise<User | null> {
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
  return result;
}
