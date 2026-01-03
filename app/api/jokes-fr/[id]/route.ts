import { NextResponse } from "next/server";
import {
  findJokeCandidateByIdFR,
  updateJokeCandidateTextFR,
  deleteJokeCandidateFR,
} from "@/lib/ingest-fr/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const joke = await findJokeCandidateByIdFR(id);

    if (!joke) {
      return NextResponse.json({ error: "[FR] Joke not found" }, { status: 404 });
    }

    return NextResponse.json({ joke });
  } catch (error) {
    console.error("[FR] Failed to fetch joke:", error);
    return NextResponse.json({ error: "[FR] Failed to fetch joke" }, { status: 500 });
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
        { error: "[FR] editedText is required and must be non-emfry" },
        { status: 400 }
      );
    }

    await updateJokeCandidateTextFR({
      id,
      editedText: editedText.trim(),
    });

    const joke = await findJokeCandidateByIdFR(id);
    return NextResponse.json({ joke });
  } catch (error) {
    console.error("[FR] Failed to update joke:", error);
    return NextResponse.json({ error: "[FR] Failed to update joke" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteJokeCandidateFR(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FR] Failed to delete joke:", error);
    return NextResponse.json({ error: "[FR] Failed to delete joke" }, { status: 500 });
  }
}
