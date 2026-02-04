import { NextRequest, NextResponse } from "next/server";
import {
  findRecentRedditMemes,
  findRedditMemeById,
  updateRedditMemeEdits,
  markRedditMemeStatus,
  getRedditMemesCount,
} from "@/lib/ingest-reddit/storage";
import { RedditMemeStatus, RedditSubreddit } from "@/lib/ingest-reddit/types";

/**
 * GET /api/reddit-ingest/queue
 * Get list of reddit memes
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const status = searchParams.get("status") as RedditMemeStatus | null;
    const subreddit = searchParams.get("subreddit") as RedditSubreddit | null;

    const memes = await findRecentRedditMemes({
      limit,
      status: status || ["pending", "reserved"],
      subreddit: subreddit || undefined,
    });

    // Get counts for each status
    const [pendingCount, reservedCount, usedCount] = await Promise.all([
      getRedditMemesCount("pending"),
      getRedditMemesCount("reserved"),
      getRedditMemesCount("used"),
    ]);

    return NextResponse.json({
      success: true,
      memes,
      count: memes.length,
      stats: {
        pending: pendingCount,
        reserved: reservedCount,
        used: usedCount,
      },
    });
  } catch (error) {
    console.error("[API] Error fetching reddit memes:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/reddit-ingest/queue
 * Update a reddit meme (edit or change status)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, editedTitle, editedImageUrl, status } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing meme ID" },
        { status: 400 }
      );
    }

    // Check if meme exists
    const meme = await findRedditMemeById(id);
    if (!meme) {
      return NextResponse.json(
        { success: false, error: "Meme not found" },
        { status: 404 }
      );
    }

    // Update edits if provided
    if (editedTitle !== undefined || editedImageUrl !== undefined) {
      await updateRedditMemeEdits({
        id,
        editedTitle,
        editedImageUrl,
      });
    }

    // Update status if provided
    if (status) {
      await markRedditMemeStatus({
        id,
        status,
      });
    }

    // Fetch updated meme
    const updatedMeme = await findRedditMemeById(id);

    return NextResponse.json({
      success: true,
      meme: updatedMeme,
    });
  } catch (error) {
    console.error("[API] Error updating reddit meme:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reddit-ingest/queue
 * Soft delete a reddit meme
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing meme ID" },
        { status: 400 }
      );
    }

    await markRedditMemeStatus({
      id,
      status: "deleted",
      notes: "Manually deleted by user",
    });

    return NextResponse.json({
      success: true,
      message: "Meme deleted successfully",
    });
  } catch (error) {
    console.error("[API] Error deleting reddit meme:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
