import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { markJokeCandidateStatus } from "@/lib/ingest/storage";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id: string;
      status: "used" | "rejected" | "pending";
      notes?: string;
    };

    if (!body?.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "Field 'id' is required" }, { status: 400 });
    }

    if (!body.status || !["used", "rejected", "pending"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const objectId = ObjectId.isValid(body.id) ? new ObjectId(body.id) : body.id;

    await markJokeCandidateStatus({ id: objectId, status: body.status, notes: body.notes });

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Failed to update joke status", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
