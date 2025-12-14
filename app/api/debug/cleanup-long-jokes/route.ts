import { NextResponse } from "next/server";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";

/**
 * POST /api/debug/cleanup-long-jokes
 * Помечает все pending анекдоты длиннее 600 символов как deleted
 */
export async function POST() {
  try {
    const collection = await getJokeCandidateCollection();

    // Находим все pending анекдоты длиннее 600 символов
    const longJokes = await collection
      .find({
        $or: [
          { status: "pending" },
          { status: { $exists: false } }
        ],
        $expr: { $gt: [{ $strLenCP: "$text" }, 600] }
      })
      .toArray();

    console.log(`Found ${longJokes.length} pending jokes longer than 600 characters`);

    if (longJokes.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No long jokes found",
        cleaned: 0,
      });
    }

    // Помечаем их как deleted
    const result = await collection.updateMany(
      {
        $or: [
          { status: "pending" },
          { status: { $exists: false } }
        ],
        $expr: { $gt: [{ $strLenCP: "$text" }, 600] }
      },
      {
        $set: {
          status: "deleted",
          deletedAt: new Date(),
          notes: "Text too long: exceeds 600 character limit",
        },
      }
    );

    console.log(`Marked ${result.modifiedCount} jokes as deleted`);

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${result.modifiedCount} long jokes`,
      cleaned: result.modifiedCount,
      found: longJokes.length,
    });
  } catch (error) {
    console.error("Error cleaning up long jokes:", error);
    return NextResponse.json(
      {
        error: "Failed to cleanup long jokes",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
