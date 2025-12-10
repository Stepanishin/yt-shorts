import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchUnsplashImage, searchUnsplashPhotos } from "@/lib/unsplash/client";

/**
 * GET /api/unsplash/random
 * Get a random image from Unsplash by keywords
 *
 * Query params:
 * - keywords: comma-separated keywords (e.g., "funny,humor,comedy")
 * - search: if true, return search results instead of random
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keywordsParam = searchParams.get("keywords");
    const isSearch = searchParams.get("search") === "true";

    if (!keywordsParam) {
      return NextResponse.json(
        { error: "keywords parameter is required" },
        { status: 400 }
      );
    }

    const keywords = keywordsParam.split(",").map((k) => k.trim());

    if (isSearch) {
      // Search mode - return multiple results
      const photos = await searchUnsplashPhotos(keywords.join(" "), 1, 10);

      return NextResponse.json({
        success: true,
        photos,
        count: photos.length,
      });
    } else {
      // Random mode - return single random image
      const photo = await fetchUnsplashImage(keywords);

      return NextResponse.json({
        success: true,
        photo,
      });
    }
  } catch (error: any) {
    console.error("Error in Unsplash API:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch image from Unsplash",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
