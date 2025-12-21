import { NextResponse } from "next/server";
import { findRecentJokeCandidatesDE } from "@/lib/ingest-de/storage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 50;

    const jokes = await findRecentJokeCandidatesDE({ limit });
    return NextResponse.json({ jokes });
  } catch (error) {
    console.error("[DE] Failed to fetch jokes queue", error);
    return NextResponse.json({ error: "[DE] Failed to fetch jokes" }, { status: 500 });
  }
}
