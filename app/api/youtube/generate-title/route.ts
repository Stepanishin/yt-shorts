import { NextRequest, NextResponse } from "next/server";
import { generateShortsTitle, generateShortsDescription } from "@/lib/youtube/title-generator";

/**
 * POST /api/youtube/generate-title
 * Генерирует оптимизированное название и описание для YouTube Shorts
 *
 * Body: {
 *   jokeText: string,
 *   jokeTitle?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jokeText, jokeTitle } = body;

    if (!jokeText) {
      return NextResponse.json(
        { error: "jokeText is required" },
        { status: 400 }
      );
    }

    // Генерируем название и описание параллельно
    const [title, description] = await Promise.all([
      generateShortsTitle(jokeText, jokeTitle),
      generateShortsDescription(jokeText),
    ]);

    return NextResponse.json({
      title: `#Shorts ${title}`,
      description,
    });
  } catch (error: any) {
    console.error("Failed to generate title:", error);
    return NextResponse.json(
      {
        error: "Failed to generate title",
        details: error.message
      },
      { status: 500 }
    );
  }
}
