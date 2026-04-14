import { NextRequest, NextResponse } from "next/server";
import { findRecentNewsCandidatesEN } from "@/lib/ingest-news/storage-en";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    console.log(`Fetching recent English news candidates (limit: ${limit})...`);

    const news = await findRecentNewsCandidatesEN({ limit });

    console.log(`Found ${news.length} English news candidates`);

    return NextResponse.json({
      news: news.map((item) => ({
        ...item,
        _id: item._id?.toString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch English news queue", error);
    return NextResponse.json(
      { error: "Failed to fetch English news queue" },
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
      const { markNewsCandidateStatusEN } = await import("@/lib/ingest-news/storage-en");
      await markNewsCandidateStatusEN({ id, status });
    } else {
      const { updateNewsCandidateEditsEN } = await import("@/lib/ingest-news/storage-en");
      await updateNewsCandidateEditsEN({
        id,
        editedTitle,
        editedSummary,
        editedImageUrl,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update English news", error);
    return NextResponse.json(
      { error: "Failed to update English news" },
      { status: 500 }
    );
  }
}
