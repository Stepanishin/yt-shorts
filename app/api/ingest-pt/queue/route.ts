import { NextResponse } from "next/server";
import { findRecentJokeCandidatesPT } from "@/lib/ingest-pt/storage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 50;

    const jokes = await findRecentJokeCandidatesPT({ limit });
    return NextResponse.json({ jokes });
  } catch (error) {
    console.error("[PT] Failed to fetch jokes queue", error);
    return NextResponse.json({ error: "[PT] Failed to fetch jokes" }, { status: 500 });
  }
}
