import { NextResponse } from "next/server";
import { runNewsIngestEN } from "@/lib/ingest-news/run-en";

export async function POST() {
  try {
    console.log("Starting English news ingest...");

    const result = await runNewsIngestEN();

    console.log("English news ingest completed:", result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to run English news ingest", error);
    return NextResponse.json(
      { error: "Failed to run English news ingest" },
      { status: 500 }
    );
  }
}
