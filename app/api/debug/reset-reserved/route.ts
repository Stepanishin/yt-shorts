import { NextResponse } from "next/server";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";

/**
 * POST /api/debug/reset-reserved
 * Сбрасывает статус всех зарезервированных анекдотов обратно в pending
 */
export async function POST() {
  try {
    const collection = await getJokeCandidateCollection();

    // Обновляем все анекдоты со статусом "reserved" на "pending"
    const result = await collection.updateMany(
      { status: "reserved" },
      {
        $set: {
          status: "pending",
        },
        $unset: {
          reservedAt: "",
        },
      }
    );

    return NextResponse.json({
      success: true,
      modified: result.modifiedCount,
      message: `Reset ${result.modifiedCount} reserved jokes back to pending`,
    });
  } catch (error) {
    console.error("Failed to reset reserved jokes:", error);
    return NextResponse.json(
      { error: "Failed to reset reserved jokes" },
      { status: 500 }
    );
  }
}
