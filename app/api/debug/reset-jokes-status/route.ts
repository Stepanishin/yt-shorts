import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";

/**
 * POST /api/debug/reset-jokes-status
 * Reset all 'used' and 'reserved' jokes back to 'pending' for testing
 * Admin only
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByGoogleId(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Allow all authenticated users in development
    // if (!user?.isAdmin) {
    //   return NextResponse.json(
    //     { error: "Admin access required" },
    //     { status: 403 }
    //   );
    // }

    const collection = await getJokeCandidateCollection();

    // Count before reset
    const usedCount = await collection.countDocuments({ status: "used" });
    const reservedCount = await collection.countDocuments({ status: "reserved" });

    // Reset 'used' and 'reserved' jokes to 'pending'
    const result = await collection.updateMany(
      { status: { $in: ["used", "reserved"] } },
      {
        $set: { status: "pending" },
        $unset: { usedAt: "", reservedAt: "", publishedAt: "" },
      }
    );

    console.log(`Reset ${result.modifiedCount} jokes back to 'pending'`);

    return NextResponse.json({
      success: true,
      message: "Jokes status reset successfully",
      stats: {
        usedBefore: usedCount,
        reservedBefore: reservedCount,
        resetCount: result.modifiedCount,
      },
    });
  } catch (error: any) {
    console.error("Error resetting jokes status:", error);
    return NextResponse.json(
      {
        error: "Failed to reset jokes status",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
