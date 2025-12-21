import { NextResponse } from "next/server";
import {
  findJokeCandidateByIdDE,
  updateJokeCandidateTextDE,
  deleteJokeCandidateDE,
} from "@/lib/ingest-de/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const joke = await findJokeCandidateByIdDE(id);

    if (!joke) {
      return NextResponse.json({ error: "[DE] Joke not found" }, { status: 404 });
    }

    return NextResponse.json({ joke });
  } catch (error) {
    console.error("[DE] Failed to fetch joke:", error);
    return NextResponse.json({ error: "[DE] Failed to fetch joke" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { editedText } = body;

    if (typeof editedText !== "string" || !editedText.trim()) {
      return NextResponse.json(
        { error: "[DE] editedText is required and must be non-empty" },
        { status: 400 }
      );
    }

    await updateJokeCandidateTextDE({
      id,
      editedText: editedText.trim(),
    });

    const joke = await findJokeCandidateByIdDE(id);
    return NextResponse.json({ joke });
  } catch (error) {
    console.error("[DE] Failed to update joke:", error);
    return NextResponse.json({ error: "[DE] Failed to update joke" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteJokeCandidateDE(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DE] Failed to delete joke:", error);
    return NextResponse.json({ error: "[DE] Failed to delete joke" }, { status: 500 });
  }
}
