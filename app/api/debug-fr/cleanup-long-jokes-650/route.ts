import { NextResponse } from "next/server";
import { getJokeCandidateCollectionFR } from "@/lib/ingest-fr/storage";

/**
 * POST /api/debug-fr/cleanup-long-jokes-650
 * Помечает все pending французские анекдоты длиннее 650 символов как deleted
 */
export async function POST() {
  try {
    const collection = await getJokeCandidateCollectionFR();

    // Находим все pending анекдоты длиннее 650
    const longJokes = await collection
      .find({
        $or: [
          { status: "pending" },
          { status: { $exists: false } }
        ],
        $expr: { $gt: [{ $strLenCP: "$text" }, 650] }
      })
      .toArray();

    console.log(`[FR] Found ${longJokes.length} pending jokes longer than 650 characters`);

    if (longJokes.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No long jokes found",
        cleaned: 0,
        found: 0,
      });
    }

    // Помечаем их как deleted
    const result = await collection.updateMany(
      {
        $or: [
          { status: "pending" },
          { status: { $exists: false } }
        ],
        $expr: { $gt: [{ $strLenCP: "$text" }, 650] }
      },
      {
        $set: {
          status: "deleted",
          deletedAt: new Date(),
          notes: "Text too long: exceeds 650 character limit",
        },
      }
    );

    console.log(`[FR] Marked ${result.modifiedCount} jokes as deleted`);

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${result.modifiedCount} long jokes`,
      cleaned: result.modifiedCount,
      found: longJokes.length,
    });
  } catch (error) {
    console.error("[FR] Error cleaning up long jokes:", error);
    return NextResponse.json(
      {
        error: "Failed to cleanup long jokes",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
