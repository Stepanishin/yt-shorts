import { NextResponse } from "next/server";
import { runNewsIngestSL } from "@/lib/ingest-news/run-sl";

export async function POST() {
  try {
    console.log("Starting Slovenian news ingest...");

    const result = await runNewsIngestSL();

    console.log("Slovenian news ingest completed:", result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to run Slovenian news ingest", error);
    return NextResponse.json(
      { error: "Failed to run Slovenian news ingest" },
      { status: 500 }
    );
  }
}
