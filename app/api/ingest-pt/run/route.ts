import { NextResponse } from "next/server";

import { runIngestPT } from "@/lib/ingest-pt/run";

export async function POST() {
  try {
    const result = await runIngestPT();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[PT] Failed to run ingest", error);
    return NextResponse.json({ error: "[PT] Failed to run ingest" }, { status: 500 });
  }
}
