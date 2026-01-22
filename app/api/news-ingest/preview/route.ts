import { NextResponse } from "next/server";
import { collectNewsPreview } from "@/lib/ingest-news/preview";
import { NewsPreviewRequest } from "@/lib/ingest-news/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NewsPreviewRequest;

    console.log("News preview request:", body);

    const result = await collectNewsPreview(body);

    return NextResponse.json({
      news: result.news,
      meta: result.meta,
      count: result.news.length,
    });
  } catch (error) {
    console.error("Failed to preview news", error);
    return NextResponse.json(
      { error: "Failed to preview news" },
      { status: 500 }
    );
  }
}
