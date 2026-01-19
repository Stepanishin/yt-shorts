import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getYouTubeChannels, deleteYouTubeChannel, setDefaultYouTubeChannel } from "@/lib/db/youtube-channels";

/**
 * GET /api/youtube/my-channels
 * Get all saved YouTube channels for the current user from youtube_channels collection
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const channels = await getYouTubeChannels(session.user.id);

    // Return channels without sensitive data (tokens)
    const publicChannels = channels.map((ch) => ({
      channelId: ch.channelId,
      channelTitle: ch.channelTitle,
      channelThumbnail: ch.channelThumbnail,
      isDefault: ch.isDefault || false,
      createdAt: ch.createdAt,
    }));

    return NextResponse.json({ channels: publicChannels });
  } catch (error) {
    console.error("Error fetching YouTube channels:", error);
    return NextResponse.json(
      { error: "Failed to fetch YouTube channels" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/youtube/my-channels
 * Set a channel as default
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { channelId, action } = await request.json();

    if (action === "set-default") {
      if (!channelId) {
        return NextResponse.json({ error: "channelId is required" }, { status: 400 });
      }

      await setDefaultYouTubeChannel(session.user.id, channelId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error updating YouTube channel:", error);
    return NextResponse.json(
      { error: "Failed to update YouTube channel" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/youtube/my-channels
 * Delete a YouTube channel
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");

    if (!channelId) {
      return NextResponse.json({ error: "channelId is required" }, { status: 400 });
    }

    const deleted = await deleteYouTubeChannel(session.user.id, channelId);
    if (!deleted) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting YouTube channel:", error);
    return NextResponse.json(
      { error: "Failed to delete YouTube channel" },
      { status: 500 }
    );
  }
}
