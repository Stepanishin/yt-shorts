import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";
import { generateLongformVideo } from "@/lib/longform/longform-generator";
import {
  createLongformJob,
  updateLongformJob,
  getLongformJob,
  listLongformJobs,
} from "@/lib/db/longform-jobs";
import { getNewsAutoGenerationConfig } from "@/lib/db/auto-generation-news";

const BACKGROUND_MUSIC_URLS = [
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Evening.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Night%20Vigil.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Late%20Night%20Radio.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Sincerely.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Almost%20Bliss.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Vibing%20Over%20Venus.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Study%20And%20Relax.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Night%20in%20Venice.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Mana%20Two%20-%20Part%202.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Mana%20Two%20-%20Part%201.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Screen%20Saver.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Ether%20Vox.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Ethernight%20Club.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Canon%20In%20D%20Interstellar%20Mix.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Space%20Jazz.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/A%20Very%20Brady%20Special.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Southern%20Gothic.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Mesmerizing%20Galaxy%20Loop.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Gothamlicious.mp3",
  "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Kalimba%20Relaxation%20Music.mp3",
];

/**
 * POST — start longform generation as a background job.
 * Returns jobId immediately; poll GET ?jobId=... for progress.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByGoogleId(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      celebrityName,
      context,
      scheduledAt,
      publishNow,
      youtubeChannelId,
      privacyStatus,
      ttsVoice,
    } = body;

    if (!celebrityName) {
      return NextResponse.json({ error: "celebrityName is required" }, { status: 400 });
    }

    const userId = user.googleId;

    const scheduleDate = publishNow
      ? new Date(Date.now() + 2 * 60 * 1000) // 2 minutes from now
      : new Date(scheduledAt || Date.now() + 24 * 60 * 60 * 1000);

    // Default channel: the one used by the active news auto-generation config,
    // so longform lands on the live channel instead of the user's default one
    let channelId: string | undefined = youtubeChannelId || undefined;
    if (!channelId) {
      const newsConfig = await getNewsAutoGenerationConfig(userId);
      channelId =
        newsConfig?.youtube?.savedChannelId ||
        newsConfig?.youtube?.manualChannelId ||
        newsConfig?.youtube?.channelId ||
        undefined;
    }

    const job = await createLongformJob(userId, celebrityName);
    const jobId = String(job._id);

    // Fire-and-forget: generation runs in the background, progress goes to the job record
    void (async () => {
      try {
        await updateLongformJob(jobId, { status: "processing", startedAt: new Date() });

        const result = await generateLongformVideo({
          userId,
          celebrityName,
          context: context || undefined,
          ttsVoice: ttsVoice || "onyx",
          backgroundMusicUrls: BACKGROUND_MUSIC_URLS,
          backgroundMusicVolume: 0.12,
          scheduledAt: scheduleDate,
          youtubeChannelId: channelId,
          youtubePrivacyStatus: privacyStatus || "public",
          onProgress: (step) =>
            updateLongformJob(jobId, { currentStep: step }).catch(() => {}),
        });

        await updateLongformJob(jobId, {
          status: "completed",
          finishedAt: new Date(),
          currentStep: "done",
          results: {
            videoUrl: result.videoUrl,
            thumbnailUrl: result.thumbnailUrl,
            title: result.title,
            duration: result.duration,
            scenesCount: result.scenesCount,
            scheduledAt: scheduleDate,
          },
        });
      } catch (error) {
        console.error("Longform background generation failed:", error);
        await updateLongformJob(jobId, {
          status: "failed",
          finishedAt: new Date(),
          errorMessage: (error as Error).message,
        }).catch(() => {});
      }
    })();

    return NextResponse.json({
      success: true,
      jobId,
      status: "pending",
      scheduledAt: scheduleDate.toISOString(),
      youtubeChannelId: channelId || null,
    });
  } catch (error) {
    console.error("Longform generation failed to start:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET — job status. ?jobId=... for one job, otherwise last 20 jobs of the user.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByGoogleId(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const jobId = request.nextUrl.searchParams.get("jobId");

    if (jobId) {
      const job = await getLongformJob(jobId);
      if (!job || job.userId !== user.googleId) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json({ job });
    }

    const jobs = await listLongformJobs(user.googleId);
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
