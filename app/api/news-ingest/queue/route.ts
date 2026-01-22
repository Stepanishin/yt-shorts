import { NextResponse } from "next/server";
import { findRecentNewsCandidates } from "@/lib/ingest-news/storage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const news = await findRecentNewsCandidates({ limit });

    return NextResponse.json({
      news,
      count: news.length,
    });
  } catch (error) {
    console.error("Failed to fetch news queue", error);
    return NextResponse.json(
      { error: "Failed to fetch news queue" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, editedTitle, editedSummary, editedImageUrl } = body;

    if (!id) {
      return NextResponse.json(
        { error: "News ID is required" },
        { status: 400 }
      );
    }

    const { updateNewsCandidateEdits } = await import("@/lib/ingest-news/storage");

    await updateNewsCandidateEdits({
      id,
      editedTitle,
      editedSummary,
      editedImageUrl,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update news", error);
    return NextResponse.json(
      { error: "Failed to update news" },
      { status: 500 }
    );
  }
}
