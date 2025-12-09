import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteScheduledVideo } from "@/lib/db/users";

/**
 * DELETE /api/youtube/schedule/[id]
 * Удаляет (отменяет) запланированное видео
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const { id: videoId } = await params;

    console.log(`Deleting scheduled video ${videoId} for user ${session.user.id}`);

    await deleteScheduledVideo(session.user.id, videoId);

    return NextResponse.json({
      success: true,
      message: "Scheduled video deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete scheduled video error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete scheduled video",
        details: error.message
      },
      { status: 500 }
    );
  }
}
