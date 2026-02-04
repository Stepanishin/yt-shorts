import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRecentMemeJobs } from "@/lib/db/auto-generation-meme";
import { getUserByGoogleId } from "@/lib/db/users";

/**
 * GET /api/auto-generation-memes/queue
 * Get recent meme generation jobs for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await getUserByGoogleId(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const jobs = await getRecentMemeJobs(user._id!.toString(), limit);

    return NextResponse.json({
      success: true,
      jobs,
      count: jobs.length,
    });
  } catch (error) {
    console.error("[API] Error getting meme jobs:", error);
    return NextResponse.json(
      { error: "Failed to get jobs" },
      { status: 500 }
    );
  }
}
