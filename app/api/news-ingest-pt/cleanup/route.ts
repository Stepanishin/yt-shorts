import { NextResponse } from "next/server";
import { getNewsCandidateCollectionPT } from "@/lib/ingest-news/storage-pt";

/**
 * DELETE endpoint to cleanup all pending Portuguese news
 * Useful after fixing scrapers to re-fetch news with correct data
 */
export async function DELETE() {
  try {
    console.log("Cleaning up all pending Portuguese news candidates...");

    const collection = await getNewsCandidateCollectionPT();

    // Delete all pending and reserved Portuguese news
    const result = await collection.deleteMany({
      status: { $in: ["pending", "reserved", undefined] }
    });

    console.log(`✓ Deleted ${result.deletedCount} Portuguese news candidates`);

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Failed to cleanup Portuguese news", error);
    return NextResponse.json(
      { error: "Failed to cleanup Portuguese news" },
      { status: 500 }
    );
  }
}
