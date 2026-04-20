import { NextRequest, NextResponse } from "next/server";
import { findRecentNewsCandidatesSL } from "@/lib/ingest-news/storage-sl";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    console.log(`Fetching recent Slovenian news candidates (limit: ${limit})...`);

    const news = await findRecentNewsCandidatesSL({ limit });

    console.log(`Found ${news.length} Slovenian news candidates`);

    return NextResponse.json({
      news: news.map((item) => ({
        ...item,
        _id: item._id?.toString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch Slovenian news queue", error);
    return NextResponse.json(
      { error: "Failed to fetch Slovenian news queue" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, editedTitle, editedSummary, editedImageUrl, status } = body;

    if (!id) {
      return NextResponse.json(
        { error: "News ID is required" },
        { status: 400 }
      );
    }

    if (status) {
      const { markNewsCandidateStatusSL } = await import("@/lib/ingest-news/storage-sl");
      await markNewsCandidateStatusSL({ id, status });
    } else {
      const { updateNewsCandidateEditsSL } = await import("@/lib/ingest-news/storage-sl");
      await updateNewsCandidateEditsSL({
        id,
        editedTitle,
        editedSummary,
        editedImageUrl,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update Slovenian news", error);
    return NextResponse.json(
      { error: "Failed to update Slovenian news" },
      { status: 500 }
    );
  }
}
