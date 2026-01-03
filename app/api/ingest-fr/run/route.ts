import { NextResponse } from "next/server";

import { runIngestFR } from "@/lib/ingest-fr/run";

export async function POST() {
  try {
    const result = await runIngestFR();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[FR] Failed to run ingest", error);
    return NextResponse.json({ error: "[FR] Failed to run ingest" }, { status: 500 });
  }
}
