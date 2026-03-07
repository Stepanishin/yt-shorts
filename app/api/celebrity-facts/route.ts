import { NextResponse } from "next/server";
import {
  insertCelebrityFact,
  findRecentCelebrityFacts,
  deleteCelebrityFact,
} from "@/lib/celebrity-facts/storage";
import { CelebrityFact } from "@/lib/celebrity-facts/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const facts = await findRecentCelebrityFacts({ limit });

    return NextResponse.json({ facts, count: facts.length });
  } catch (error) {
    console.error("Failed to fetch celebrity facts", error);
    return NextResponse.json(
      { error: "Failed to fetch celebrity facts" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, imageHashtags, sourceLinks, text } = body as Partial<CelebrityFact>;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (!Array.isArray(imageHashtags) || imageHashtags.length === 0) {
      return NextResponse.json(
        { error: "imageHashtags must be a non-empty array" },
        { status: 400 }
      );
    }
    if (!Array.isArray(sourceLinks) || sourceLinks.length === 0) {
      return NextResponse.json(
        { error: "sourceLinks must be a non-empty array" },
        { status: 400 }
      );
    }

    const fact: CelebrityFact = {
      title: title.trim(),
      text: text.trim(),
      imageHashtags,
      sourceLinks,
    };

    const result = await insertCelebrityFact(fact);

    return NextResponse.json({ success: true, insertedId: result.insertedId }, { status: 201 });
  } catch (error) {
    console.error("Failed to insert celebrity fact", error);
    return NextResponse.json(
      { error: "Failed to insert celebrity fact" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteCelebrityFact(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete celebrity fact", error);
    return NextResponse.json(
      { error: "Failed to delete celebrity fact" },
      { status: 500 }
    );
  }
}
