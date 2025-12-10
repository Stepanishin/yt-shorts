import { createApi } from "unsplash-js";

// Initialize Unsplash API client
const unsplash = createApi({
  accessKey: process.env.UNSPLASH_ACCESS_KEY || "",
});

export interface UnsplashPhoto {
  url: string; // Regular size image URL
  downloadUrl: string; // Download tracking URL
  photographer: {
    name: string;
    profileUrl: string;
  };
  description?: string;
}

/**
 * Fetch a random image from Unsplash by keywords
 * @param keywords - Array of search keywords
 * @param contextText - Optional context for more relevant results
 * @returns UnsplashPhoto object
 */
export async function fetchUnsplashImage(
  keywords: string[],
  contextText?: string
): Promise<UnsplashPhoto> {
  if (!process.env.UNSPLASH_ACCESS_KEY) {
    throw new Error("UNSPLASH_ACCESS_KEY is not configured");
  }

  // Combine keywords into query
  const query = keywords.join(" ");

  try {
    const result = await unsplash.photos.getRandom({
      query,
      orientation: "portrait", // Vertical format for shorts (720x1280)
      contentFilter: "high", // Safe content only
    });

    if (result.type === "error") {
      const errors = result.errors?.join(", ") || "Unknown error";
      throw new Error(`Unsplash API error: ${errors}`);
    }

    const photo = result.response as any;

    if (!photo) {
      throw new Error("No photo returned from Unsplash");
    }

    // Track download for attribution (Unsplash API requirement)
    await trackUnsplashDownload(photo.links.download_location);

    return {
      url: photo.urls.regular, // 1080px wide
      downloadUrl: photo.links.download_location,
      photographer: {
        name: photo.user.name,
        profileUrl: photo.user.links.html,
      },
      description: photo.description || photo.alt_description,
    };
  } catch (error) {
    console.error("Error fetching Unsplash image:", error);
    throw error;
  }
}

/**
 * Track download for Unsplash attribution
 * Required by Unsplash API guidelines
 */
async function trackUnsplashDownload(downloadLocationUrl: string): Promise<void> {
  try {
    await unsplash.photos.trackDownload({
      downloadLocation: downloadLocationUrl,
    });
  } catch (error) {
    console.error("Failed to track Unsplash download:", error);
    // Don't throw - this is non-critical
  }
}

/**
 * Search Unsplash photos by query
 * @param query - Search query
 * @param page - Page number (default: 1)
 * @param perPage - Results per page (default: 10)
 */
export async function searchUnsplashPhotos(
  query: string,
  page: number = 1,
  perPage: number = 10
): Promise<UnsplashPhoto[]> {
  if (!process.env.UNSPLASH_ACCESS_KEY) {
    throw new Error("UNSPLASH_ACCESS_KEY is not configured");
  }

  try {
    const result = await unsplash.search.getPhotos({
      query,
      page,
      perPage,
      orientation: "portrait",
      contentFilter: "high",
    });

    if (result.type === "error") {
      const errors = result.errors?.join(", ") || "Unknown error";
      throw new Error(`Unsplash API error: ${errors}`);
    }

    const photos = result.response.results.map((photo: any) => ({
      url: photo.urls.regular,
      downloadUrl: photo.links.download_location,
      photographer: {
        name: photo.user.name,
        profileUrl: photo.user.links.html,
      },
      description: photo.description || photo.alt_description,
    }));

    return photos;
  } catch (error) {
    console.error("Error searching Unsplash photos:", error);
    throw error;
  }
}
