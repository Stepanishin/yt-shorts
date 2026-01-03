import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getJobsByUserFR, AutoGenerationJobFR } from "@/lib/db/auto-generation-fr";
import { getUserByGoogleId } from "@/lib/db/users";

/**
 * GET /api/auto-generation-fr/queue
 * Get auto-generation jobs for French videos for the current user
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
    const status = searchParams.get("status") as AutoGenerationJobFR["status"] | null;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const jobs = await getJobsByUserFR(user._id!.toString(), {
      status: status || undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      jobs,
      total: jobs.length,
    });
  } catch (error) {
    console.error("[FR] Error fetching auto-generation queue:", error);
    return NextResponse.json(
      { error: "Failed to fetch queue" },
      { status: 500 }
    );
  }
}
