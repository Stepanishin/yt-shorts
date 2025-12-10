import { renderVideoNew, RenderVideoNewOptions } from "@/lib/video/renderer-new";
import { AutoGenerationTemplate } from "@/lib/db/auto-generation";

/**
 * Calculate GIF position for "bottom-right" placement
 */
function calculateGifPosition(
  template: AutoGenerationTemplate
): { x: number; y: number } {
  if (template.gif.position === "fixed" && template.gif.fixedPosition) {
    return template.gif.fixedPosition;
  }

  // Bottom-right position with padding
  // Shifted 50px left and 50px up from original bottom-right position
  const paddingRight = 70; // 20 + 50
  const paddingBottom = 70; // 20 + 50
  const videoWidth = 720;
  const videoHeight = 1280;

  return {
    x: videoWidth - template.gif.width - paddingRight,
    y: videoHeight - template.gif.height - paddingBottom,
  };
}

/**
 * Render auto-generated video
 * @param template - Template configuration
 * @param jokeText - Text content (joke)
 * @param backgroundImageUrl - Background image URL
 * @param gifUrl - GIF URL
 * @param audioUrl - Audio URL
 * @param audioTrimStart - Audio trim start time
 * @param audioTrimEnd - Audio trim end time
 * @param jobId - Job ID for tracking
 * @returns Rendered video URL and duration
 */
export async function renderAutoVideo(
  template: AutoGenerationTemplate,
  jokeText: string,
  backgroundImageUrl: string,
  gifUrl: string | null,
  audioUrl: string | null,
  audioTrimStart: number | undefined,
  audioTrimEnd: number | undefined,
  jobId: string
): Promise<{ videoUrl: string; duration: number }> {
  console.log(`[${jobId}] Starting video render...`);

  // Calculate GIF position
  const gifPosition = calculateGifPosition(template);

  // Prepare render options
  const renderOptions: RenderVideoNewOptions = {
    backgroundImageUrl,
    imageEffect: template.background.imageEffect,

    // Text element
    textElements: [
      {
        text: jokeText,
        x: -1, // -1 означает центрирование по горизонтали
        y: -1, // -1 означает центрирование по вертикали
        fontSize: template.text.fontSize,
        color: template.text.color,
        backgroundColor: template.text.backgroundColor,
        boxPadding: template.text.boxPadding,
        fontWeight: template.text.fontWeight,
        width: template.text.width,
        lineSpacing: template.text.lineSpacing || 12,
      },
    ],

    // No emoji elements for now
    emojiElements: [],

    // GIF element (if provided)
    gifElements: gifUrl
      ? [
          {
            url: gifUrl,
            x: gifPosition.x,
            y: gifPosition.y,
            width: template.gif.width,
            height: template.gif.height,
          },
        ]
      : [],

    // Audio (if provided)
    audioUrl: audioUrl || undefined,
    audioTrimStart,
    audioTrimEnd,

    // Video duration
    duration: template.audio.duration,

    // Job ID for tracking
    jobId,
  };

  console.log(`[${jobId}] Render options prepared:`, {
    backgroundImage: backgroundImageUrl,
    textLength: jokeText.length,
    hasGif: !!gifUrl,
    hasAudio: !!audioUrl,
    duration: template.audio.duration,
  });

  // Render video using existing renderer
  try {
    const result = await renderVideoNew(renderOptions);

    console.log(`[${jobId}] Video rendered successfully:`, {
      url: result.videoUrl,
      duration: result.duration,
    });

    return {
      videoUrl: result.videoUrl,
      duration: result.duration,
    };
  } catch (error) {
    console.error(`[${jobId}] Error rendering video:`, error);
    throw error;
  }
}
