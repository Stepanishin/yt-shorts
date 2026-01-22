import { NextResponse } from "next/server";
import { runNewsIngest } from "@/lib/ingest-news/run";

export async function POST() {
  try {
    console.log("Starting news ingest...");

    const result = await runNewsIngest();

    console.log("News ingest completed:", result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to run news ingest", error);
    return NextResponse.json(
      { error: "Failed to run news ingest" },
      { status: 500 }
    );
  }
}
