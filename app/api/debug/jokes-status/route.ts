import { NextResponse } from "next/server";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";

/**
 * GET /api/debug/jokes-status
 * Отображает статистику по статусам анекдотов в базе данных
 */
export async function GET() {
  try {
    const collection = await getJokeCandidateCollection();

    // Получаем статистику по статусам
    const statusCounts = await collection.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();

    // Получаем несколько примеров анекдотов для каждого статуса
    const samples: Record<string, any[]> = {};

    for (const statusGroup of statusCounts) {
      const status = statusGroup._id ?? "undefined";
      const query = statusGroup._id ? { status: statusGroup._id } : { status: { $exists: false } };

      samples[String(status)] = await collection
        .find(query)
        .limit(3)
        .project({ _id: 1, text: 1, status: 1, source: 1, createdAt: 1 })
        .toArray();
    }

    // Общее количество анекдотов
    const total = await collection.countDocuments();

    return NextResponse.json({
      total,
      byStatus: statusCounts,
      samples,
    });
  } catch (error) {
    console.error("Failed to get jokes status:", error);
    return NextResponse.json(
      { error: "Failed to get jokes status" },
      { status: 500 }
    );
  }
}
