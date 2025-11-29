import { NextResponse } from "next/server";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";

/**
 * DELETE /api/debug/cleanup-deleted
 * Удаляет все анекдоты со статусом "deleted" из базы данных
 */
export async function DELETE() {
  try {
    const collection = await getJokeCandidateCollection();

    // Сначала получаем количество записей для удаления
    const countBefore = await collection.countDocuments({ status: "deleted" });

    if (countBefore === 0) {
      return NextResponse.json({
        success: true,
        message: "No jokes with 'deleted' status found",
        deletedCount: 0,
      });
    }

    // Удаляем все записи со статусом "deleted"
    const result = await collection.deleteMany({ status: "deleted" });

    console.log(`Deleted ${result.deletedCount} jokes with 'deleted' status`);

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} jokes`,
      deletedCount: result.deletedCount,
      countBefore,
    });
  } catch (error) {
    console.error("Failed to cleanup deleted jokes:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to cleanup deleted jokes",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/debug/cleanup-deleted
 * Показывает количество анекдотов со статусом "deleted" без удаления
 */
export async function GET() {
  try {
    const collection = await getJokeCandidateCollection();

    // Получаем количество записей для удаления
    const deletedCount = await collection.countDocuments({ status: "deleted" });

    // Получаем несколько примеров
    const samples = await collection
      .find({ status: "deleted" })
      .limit(5)
      .project({ _id: 1, text: 1, source: 1, notes: 1, createdAt: 1 })
      .toArray();

    return NextResponse.json({
      deletedCount,
      samples,
      message: deletedCount > 0
        ? `Found ${deletedCount} jokes with 'deleted' status. Use DELETE method to remove them.`
        : "No jokes with 'deleted' status found",
    });
  } catch (error) {
    console.error("Failed to get deleted jokes info:", error);
    return NextResponse.json(
      { error: "Failed to get deleted jokes info" },
      { status: 500 }
    );
  }
}
