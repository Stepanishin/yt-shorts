import { NextResponse } from "next/server";
import { runRedditIngest } from "@/lib/ingest-reddit/run";

/**
 * POST /api/reddit-ingest/run
 * Manually trigger Reddit memes collection
 */
export async function POST() {
  try {
    console.log("[API] Starting Reddit memes ingest...");

    const result = await runRedditIngest();

    return NextResponse.json({
      success: true,
      message: `Reddit ingest completed: ${result.totalInserted} new memes`,
      data: {
        totalFetched: result.totalFetched,
        totalInserted: result.totalInserted,
        totalDuplicates: result.totalDuplicates,
        totalFiltered: result.totalFiltered,
        results: result.results,
        duration: result.completedAt.getTime() - result.startedAt.getTime(),
      },
    });
  } catch (error) {
    console.error("[API] Reddit ingest error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
