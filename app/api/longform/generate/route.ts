import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";
import { generateLongformVideo } from "@/lib/longform/longform-generator";

const BACKGROUND_MUSIC_URLS = [
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Evening.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Night%20Vigil.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Late%20Night%20Radio.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Sincerely.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Almost%20Bliss.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Vibing%20Over%20Venus.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Study%20And%20Relax.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Night%20in%20Venice.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Mana%20Two%20-%20Part%202.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Mana%20Two%20-%20Part%201.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Screen%20Saver.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Ether%20Vox.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Ethernight%20Club.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Canon%20In%20D%20Interstellar%20Mix.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Space%20Jazz.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/A%20Very%20Brady%20Special.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Southern%20Gothic.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Mesmerizing%20Galaxy%20Loop.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Gothamlicious.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Kalimba%20Relaxation%20Music.mp3",
];

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

    const result = await generateLongformVideo({
      userId,
      celebrityName,
      context: context || undefined,
      ttsVoice: ttsVoice || "onyx",
      backgroundMusicUrls: BACKGROUND_MUSIC_URLS,
      backgroundMusicVolume: 0.12,
      scheduledAt: scheduleDate,
      youtubeChannelId: youtubeChannelId || undefined,
      youtubePrivacyStatus: privacyStatus || "public",
    });

    return NextResponse.json({
      success: true,
      ...result,
      scheduledAt: scheduleDate.toISOString(),
    });
  } catch (error) {
    console.error("Longform generation failed:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
