import { NextResponse } from "next/server";
import { runNewsIngestPT } from "@/lib/ingest-news/run-pt";

export async function POST() {
  try {
    console.log("Starting Portuguese news ingest...");

    const result = await runNewsIngestPT();

    console.log("Portuguese news ingest completed:", result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to run Portuguese news ingest", error);
    return NextResponse.json(
      { error: "Failed to run Portuguese news ingest" },
      { status: 500 }
    );
  }
}
