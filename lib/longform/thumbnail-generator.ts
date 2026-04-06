import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { uploadVideoToSpaces, isSpacesConfigured } from "@/lib/storage/spaces-client";

/**
 * Generate a YouTube thumbnail for a long-form video.
 * Uses node-canvas to composite: celebrity photo + title text + dramatic styling.
 */
export async function generateThumbnail(
  celebrityImagePath: string,
  celebrityName: string,
  jobId: string,
  hookText?: string // e.g. "EL SECRETO QUE OCULTÓ"
): Promise<{ thumbnailUrl: string; localPath: string }> {
  console.log(`🖼️ Generating thumbnail for: ${celebrityName}...`);

  const { createCanvas, loadImage } = await import("canvas");

  const WIDTH = 1280;
  const HEIGHT = 720;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // Black background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Load and draw celebrity image (left 70% of frame)
  try {
    const img = await loadImage(celebrityImagePath);
    const imgWidth = WIDTH * 0.7;
    const imgHeight = HEIGHT;
    const scale = Math.max(imgWidth / img.width, imgHeight / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const offsetX = (imgWidth - drawWidth) / 2;
    const offsetY = (imgHeight - drawHeight) / 2;

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

    // Gradient overlay from right (for text area)
    const gradient = ctx.createLinearGradient(WIDTH * 0.4, 0, WIDTH, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.4, "rgba(0,0,0,0.7)");
    gradient.addColorStop(1, "rgba(0,0,0,0.95)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Bottom gradient for readability
    const bottomGradient = ctx.createLinearGradient(0, HEIGHT * 0.6, 0, HEIGHT);
    bottomGradient.addColorStop(0, "rgba(0,0,0,0)");
    bottomGradient.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } catch (e) {
    console.warn("Failed to load celebrity image for thumbnail, using text only");
  }

  // Red "EXCLUSIVA" badge — top left
  ctx.fillStyle = "#FF0000";
  ctx.fillRect(30, 25, 220, 50);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 32px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("EXCLUSIVA", 140, 60);

  // Celebrity name — big, bold, white with black outline — center-bottom area
  ctx.font = "bold 72px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";

  const nameParts = celebrityName.toUpperCase().split(" ");
  const maxWidth = WIDTH * 0.8;
  let lines: string[] = [];
  let currentLine = "";

  for (const word of nameParts) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const nameY = HEIGHT - 200 - (lines.length * 75);
  lines.forEach((line, i) => {
    const y = nameY + i * 75;
    // Black stroke
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 8;
    ctx.strokeText(line, WIDTH / 2, y);
    // White fill
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(line, WIDTH / 2, y);
  });

  // Hook text — yellow, bold — bottom area
  const hook = hookText || "LO QUE NADIE TE CONTÓ";
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 44px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  // Black bg bar behind hook text
  const hookMetrics = ctx.measureText(hook);
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(
    WIDTH / 2 - hookMetrics.width / 2 - 20,
    HEIGHT - 100,
    hookMetrics.width + 40,
    60
  );
  ctx.fillStyle = "#FFD700";
  ctx.fillText(hook, WIDTH / 2, HEIGHT - 55);

  // Red border — top and bottom
  ctx.fillStyle = "#FF0000";
  ctx.fillRect(0, 0, WIDTH, 6);
  ctx.fillRect(0, HEIGHT - 6, WIDTH, 6);

  // Save thumbnail
  const tmpDir = os.tmpdir();
  const localPath = path.join(tmpDir, `longform_thumb_${jobId}.jpg`);
  const buffer = canvas.toBuffer("image/jpeg", { quality: 0.92 });
  fs.writeFileSync(localPath, buffer);

  console.log(`✅ Thumbnail generated: ${localPath}`);

  // Upload to Spaces
  let thumbnailUrl = localPath;
  if (isSpacesConfigured()) {
    thumbnailUrl = await uploadVideoToSpaces({
      filePath: localPath,
      fileName: `longform/thumbnails/${jobId}.jpg`,
      contentType: "image/jpeg",
    });
  }

  return { thumbnailUrl, localPath };
}
