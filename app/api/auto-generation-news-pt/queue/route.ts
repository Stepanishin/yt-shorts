import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";
import { getNewsJobsByUser } from "@/lib/db/auto-generation-news-pt";

/**
 * GET /api/auto-generation-news-pt/queue
 * Get Portuguese news auto-generation jobs for the user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByGoogleId(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as "pending" | "processing" | "completed" | "failed" | undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const jobs = await getNewsJobsByUser(user._id!.toString(), {
      status,
      limit,
    });

    return NextResponse.json({
      success: true,
      jobs,
      count: jobs.length,
    });
  } catch (error) {
    console.error("Error fetching Portuguese news jobs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
