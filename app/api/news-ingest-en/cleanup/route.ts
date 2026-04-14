import { NextResponse } from "next/server";
import { getNewsCandidateCollectionEN } from "@/lib/ingest-news/storage-en";

export async function DELETE() {
  try {
    console.log("Cleaning up all pending English news candidates...");

    const collection = await getNewsCandidateCollectionEN();

    const result = await collection.deleteMany({
      status: { $in: ["pending", "reserved", undefined] }
    });

    console.log(`✓ Deleted ${result.deletedCount} English news candidates`);

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Failed to cleanup English news", error);
    return NextResponse.json(
      { error: "Failed to cleanup English news" },
      { status: 500 }
    );
  }
}
