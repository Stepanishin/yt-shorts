import { MongoClient, Db, ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";

export interface CustomTextBlock {
  _id?: ObjectId;
  userId: string; // ObjectId as string
  name?: string; // Optional name for the block
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  boxPadding?: number;
  fontWeight?: "normal" | "bold";
  width?: number;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = "custom_blocks";

export async function getCustomBlocksByUserId(userId: string): Promise<CustomTextBlock[]> {
  const db = await getMongoDatabase();
  const blocks = await db
    .collection<CustomTextBlock>(COLLECTION_NAME)
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
  return blocks;
}

export async function createCustomBlock(
  userId: string,
  blockData: Omit<CustomTextBlock, "_id" | "userId" | "createdAt" | "updatedAt">
): Promise<CustomTextBlock> {
  const db = await getMongoDatabase();

  const newBlock: Omit<CustomTextBlock, "_id"> = {
    ...blockData,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection<CustomTextBlock>(COLLECTION_NAME).insertOne(newBlock as CustomTextBlock);

  return {
    ...newBlock,
    _id: result.insertedId,
  };
}

export async function deleteCustomBlock(blockId: string, userId: string): Promise<boolean> {
  const db = await getMongoDatabase();

  const result = await db.collection<CustomTextBlock>(COLLECTION_NAME).deleteOne({
    _id: new ObjectId(blockId),
    userId, // Ensure user can only delete their own blocks
  });

  return result.deletedCount === 1;
}

export async function updateCustomBlock(
  blockId: string,
  userId: string,
  updates: Partial<Omit<CustomTextBlock, "_id" | "userId" | "createdAt" | "updatedAt">>
): Promise<CustomTextBlock | null> {
  const db = await getMongoDatabase();

  const result = await db.collection<CustomTextBlock>(COLLECTION_NAME).findOneAndUpdate(
    {
      _id: new ObjectId(blockId),
      userId, // Ensure user can only update their own blocks
    },
    {
      $set: {
        ...updates,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  return result || null;
}

