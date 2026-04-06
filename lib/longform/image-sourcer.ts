import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getMongoDatabase } from "@/lib/db/mongodb";

export interface SourcedImage {
  url: string;
  source: "google" | "hola" | "wikimedia";
  query: string;
}

/**
 * Find images for each scene. Uses free sources only:
 * 1. Google Images scraping (free)
 * 2. Hola.com article scraping (free, already have scraper)
 * 3. Wikimedia Commons API (free)
 *
 * Results are cached in MongoDB to avoid re-scraping.
 */
export async function findImagesForScenes(
  scenes: { sceneNumber: number; imageSearchQuery: string }[],
  celebrityName: string
): Promise<SourcedImage[]> {
  console.log(`🖼️ Finding images for ${scenes.length} scenes (${celebrityName})...`);

  // First, batch-fetch Wikimedia images for the celebrity (one request, many results)
  const wikimediaImages = await searchWikimediaBatch(celebrityName, scenes.length + 5);
  console.log(`  Wikimedia batch: found ${wikimediaImages.length} images`);

  const usedUrls = new Set<string>();
  const images: SourcedImage[] = [];

  for (const scene of scenes) {
    const query = scene.imageSearchQuery;
    console.log(`  Scene ${scene.sceneNumber}: "${query}"`);

    let imageUrl: string | null = null;

    // Try cache first
    imageUrl = await getCachedImage(celebrityName, query);
    if (imageUrl && !usedUrls.has(imageUrl)) {
      console.log(`  ✅ Cache hit`);
      usedUrls.add(imageUrl);
      images.push({ url: imageUrl, source: "google", query });
      continue;
    }

    // Try Google Images scraping
    imageUrl = await scrapeGoogleImage(query);
    if (imageUrl && !usedUrls.has(imageUrl)) {
      console.log(`  ✅ Google Images`);
      usedUrls.add(imageUrl);
      await cacheImage(celebrityName, query, imageUrl, "google");
      images.push({ url: imageUrl, source: "google", query });
      continue;
    }

    // Try Wikimedia from pre-fetched batch (pick next unused)
    const wikiImg = wikimediaImages.find((u) => !usedUrls.has(u));
    if (wikiImg) {
      console.log(`  ✅ Wikimedia (batch)`);
      usedUrls.add(wikiImg);
      await cacheImage(celebrityName, query, wikiImg, "wikimedia");
      images.push({ url: wikiImg, source: "wikimedia", query });
      continue;
    }

    // Fallback: broader Google search with just the celebrity name
    imageUrl = await scrapeGoogleImage(`${celebrityName} foto`);
    if (imageUrl && !usedUrls.has(imageUrl)) {
      console.log(`  ✅ Google (fallback)`);
      usedUrls.add(imageUrl);
      await cacheImage(celebrityName, query, imageUrl, "google");
      images.push({ url: imageUrl, source: "google", query });
      continue;
    }

    console.log(`  ⚠️ No unique image, reusing with different Ken Burns`);
    // Reuse a previous image — video renderer will apply different Ken Burns effect
    const reuse = images[images.length - 1]?.url || images[0]?.url || "";
    images.push({ url: reuse, source: "google", query });
  }

  const unique = new Set(images.map((i) => i.url)).size;
  console.log(`✅ Found ${images.length} images (${unique} unique)`);

  return images;
}

/**
 * Scrape Google Images search results (no API key needed)
 */
async function scrapeGoogleImage(query: string): Promise<string | null> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://www.google.com/search?q=${encodedQuery}&tbm=isch&tbs=isz:l`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "es-ES,es;q=0.9",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extract image URLs from Google Images HTML
    // Google embeds image URLs in various formats
    const patterns = [
      /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\d+,\d+\]/gi,
      /data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi,
      /\["(https?:\/\/[^"]*(?:upload\.wikimedia|images\.hola|diezminutos|lecturas|vanitatis)[^"]+)"/gi,
    ];

    const foundUrls: string[] = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const imgUrl = match[1];
        // Filter out tiny images, icons, and Google's own assets
        if (
          imgUrl &&
          !imgUrl.includes("gstatic.com") &&
          !imgUrl.includes("google.com") &&
          !imgUrl.includes("googleapis.com") &&
          imgUrl.length < 500
        ) {
          foundUrls.push(imgUrl);
        }
      }
    }

    // Return the first valid large image
    return foundUrls[0] || null;
  } catch (error) {
    console.error(`  Google scraping failed:`, (error as Error).message);
    return null;
  }
}

/**
 * Batch-fetch multiple Wikimedia Commons images for a celebrity (single API call).
 * Returns array of image URLs, avoids rate limiting by fetching all at once.
 */
async function searchWikimediaBatch(query: string, limit: number = 20): Promise<string[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodedQuery}&srnamespace=6&srlimit=${limit}&format=json`;

    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "ShortsGenerator/1.0 (contact: evgenii.stepanishin@gmail.com)" },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const results = data.query?.search || [];

    if (results.length === 0) return [];

    // Batch-fetch all image URLs in one API call
    const titles = results.map((r: any) => r.title).join("|");
    const fileUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url&iiurlwidth=1920&format=json`;

    const fileRes = await fetch(fileUrl, {
      headers: { "User-Agent": "ShortsGenerator/1.0 (contact: evgenii.stepanishin@gmail.com)" },
    });

    if (!fileRes.ok) return [];

    const fileData = await fileRes.json();
    const pages = fileData.query?.pages || {};

    const urls: string[] = [];
    for (const pageId of Object.keys(pages)) {
      const imageInfo = pages[pageId]?.imageinfo?.[0];
      const url = imageInfo?.thumburl || imageInfo?.url;
      if (url && (url.endsWith(".jpg") || url.endsWith(".jpeg") || url.endsWith(".png") || url.includes("jpg/") || url.includes("png/"))) {
        urls.push(url);
      }
    }

    return urls;
  } catch (error) {
    console.error(`  Wikimedia batch search failed:`, (error as Error).message);
    return [];
  }
}

// ============ MongoDB Image Cache ============

const CACHE_COLLECTION = "celebrity_images_cache";

async function getCachedImage(
  celebrityName: string,
  query: string
): Promise<string | null> {
  try {
    const db = await getMongoDatabase();
    const doc = await db.collection(CACHE_COLLECTION).findOne({
      celebrityName: celebrityName.toLowerCase(),
      query,
    });
    return doc?.url || null;
  } catch {
    return null;
  }
}

async function cacheImage(
  celebrityName: string,
  query: string,
  url: string,
  source: string
): Promise<void> {
  try {
    const db = await getMongoDatabase();
    await db.collection(CACHE_COLLECTION).updateOne(
      { celebrityName: celebrityName.toLowerCase(), query },
      {
        $set: { url, source, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
  } catch {}
}

/**
 * Download image to local temp file for FFmpeg processing.
 * Includes retry logic and delay to avoid rate limiting.
 */
export async function downloadImage(
  url: string,
  jobId: string,
  index: number
): Promise<string> {
  const tmpDir = os.tmpdir();
  const ext = url.includes(".png") ? "png" : "jpg";
  const localPath = path.join(tmpDir, `longform_img_${jobId}_${index}.${ext}`);

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Small delay between downloads to avoid rate limiting
      if (index > 0) await sleep(500);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "ShortsGenerator/1.0 (contact: evgenii.stepanishin@gmail.com)",
        },
      });

      if (response.status === 429 && attempt < maxRetries) {
        console.log(`    Rate limited, waiting ${attempt * 2}s...`);
        await sleep(attempt * 2000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(localPath, buffer);
      return localPath;
    } catch (e) {
      if (attempt === maxRetries) {
        throw new Error(`Failed to download image after ${maxRetries} attempts: ${(e as Error).message} ${url}`);
      }
      await sleep(attempt * 1000);
    }
  }

  throw new Error(`Failed to download image: ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
