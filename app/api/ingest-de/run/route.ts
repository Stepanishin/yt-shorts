import { NextResponse } from "next/server";

import { runIngestDE } from "@/lib/ingest-de/run";

export async function POST() {
  try {
    const result = await runIngestDE();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[DE] Failed to run ingest", error);
    return NextResponse.json({ error: "[DE] Failed to run ingest" }, { status: 500 });
  }
}
