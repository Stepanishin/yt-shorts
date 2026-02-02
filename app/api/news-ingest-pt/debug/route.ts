import { NextResponse } from "next/server";
import { getNewsCandidateCollectionPT } from "@/lib/ingest-news/storage-pt";

export async function GET() {
  try {
    console.log("Debugging Portuguese news collection...");

    const collection = await getNewsCandidateCollectionPT();

    // Get collection stats
    const totalCount = await collection.countDocuments();
    const pendingCount = await collection.countDocuments({ status: "pending" });
    const reservedCount = await collection.countDocuments({ status: "reserved" });
    const usedCount = await collection.countDocuments({ status: "used" });
    const deletedCount = await collection.countDocuments({ status: "deleted" });

    // Get recent news by status
    const recentPending = await collection
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const recentReserved = await collection
      .find({ status: "reserved" })
      .sort({ reservedAt: -1 })
      .limit(5)
      .toArray();

    const recentUsed = await collection
      .find({ status: "used" })
      .sort({ usedAt: -1 })
      .limit(5)
      .toArray();

    return NextResponse.json({
      stats: {
        total: totalCount,
        pending: pendingCount,
        reserved: reservedCount,
        used: usedCount,
        deleted: deletedCount,
      },
      samples: {
        recentPending: recentPending.map(n => ({
          id: n._id?.toString(),
          title: n.title,
          source: n.source,
          language: n.language,
          createdAt: n.createdAt,
        })),
        recentReserved: recentReserved.map(n => ({
          id: n._id?.toString(),
          title: n.title,
          source: n.source,
          language: n.language,
          reservedAt: n.reservedAt,
        })),
        recentUsed: recentUsed.map(n => ({
          id: n._id?.toString(),
          title: n.title,
          source: n.source,
          language: n.language,
          usedAt: n.usedAt,
        })),
      },
    });
  } catch (error) {
    console.error("Failed to debug Portuguese news collection", error);
    return NextResponse.json(
      { error: "Failed to debug Portuguese news collection" },
      { status: 500 }
    );
  }
}
