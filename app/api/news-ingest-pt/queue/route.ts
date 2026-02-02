import { NextRequest, NextResponse } from "next/server";
import { findRecentNewsCandidatesPT } from "@/lib/ingest-news/storage-pt";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    console.log(`Fetching recent Portuguese news candidates (limit: ${limit})...`);

    const news = await findRecentNewsCandidatesPT({ limit });

    console.log(`Found ${news.length} Portuguese news candidates`);

    return NextResponse.json({
      news: news.map((item) => ({
        ...item,
        _id: item._id?.toString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch Portuguese news queue", error);
    return NextResponse.json(
      { error: "Failed to fetch Portuguese news queue" },
      { status: 500 }
    );
  }
}
