import { NextResponse } from "next/server";
import {
  findJokeCandidateByIdPT,
  updateJokeCandidateTextPT,
  deleteJokeCandidatePT,
} from "@/lib/ingest-pt/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const joke = await findJokeCandidateByIdPT(id);

    if (!joke) {
      return NextResponse.json({ error: "[PT] Joke not found" }, { status: 404 });
    }

    return NextResponse.json({ joke });
  } catch (error) {
    console.error("[PT] Failed to fetch joke:", error);
    return NextResponse.json({ error: "[PT] Failed to fetch joke" }, { status: 500 });
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
        { error: "[PT] editedText is required and must be non-empty" },
        { status: 400 }
      );
    }

    await updateJokeCandidateTextPT({
      id,
      editedText: editedText.trim(),
    });

    const joke = await findJokeCandidateByIdPT(id);
    return NextResponse.json({ joke });
  } catch (error) {
    console.error("[PT] Failed to update joke:", error);
    return NextResponse.json({ error: "[PT] Failed to update joke" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteJokeCandidatePT(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PT] Failed to delete joke:", error);
    return NextResponse.json({ error: "[PT] Failed to delete joke" }, { status: 500 });
  }
}
