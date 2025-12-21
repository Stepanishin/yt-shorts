import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getJobsByUserDE, AutoGenerationJobDE } from "@/lib/db/auto-generation-de";
import { getUserByGoogleId } from "@/lib/db/users";

/**
 * GET /api/auto-generation-de/queue
 * Get auto-generation jobs for German videos for the current user
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
    const status = searchParams.get("status") as AutoGenerationJobDE["status"] | null;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const jobs = await getJobsByUserDE(user._id!.toString(), {
      status: status || undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      jobs,
      total: jobs.length,
    });
  } catch (error) {
    console.error("[DE] Error fetching auto-generation queue:", error);
    return NextResponse.json(
      { error: "Failed to fetch queue" },
      { status: 500 }
    );
  }
}
