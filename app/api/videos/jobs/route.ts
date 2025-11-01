import { NextResponse } from "next/server";

import { listVideoJobs } from "@/lib/video/storage";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limitCandidate = limitParam ? Number(limitParam) : undefined;
    const limit = sanitizeLimit(limitCandidate);

    const jobs = await listVideoJobs({ limit });

    return NextResponse.json({ jobs, limit });
  } catch (error) {
    console.error("Failed to load video jobs", error);
    return NextResponse.json({ error: "Failed to load video jobs" }, { status: 500 });
  }
}

const sanitizeLimit = (value: number | undefined) => {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(value), MAX_LIMIT);
};
