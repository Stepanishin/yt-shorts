import { NextResponse } from "next/server";

import { runIngest } from "@/lib/ingest/run";

export async function POST() {
  try {
    const result = await runIngest();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to run ingest", error);
    return NextResponse.json({ error: "Failed to run ingest" }, { status: 500 });
  }
}

