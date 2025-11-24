import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId, updateUser } from "@/lib/db/users";
import { encrypt, decrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByGoogleId(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Return settings without decrypting sensitive data
    if (user.youtubeSettings) {
      return NextResponse.json({
        settings: {
          clientId: user.youtubeSettings.clientId,
          redirectUri: user.youtubeSettings.redirectUri,
          defaultPrivacyStatus: user.youtubeSettings.defaultPrivacyStatus,
          defaultTags: user.youtubeSettings.defaultTags,
          channelId: user.youtubeSettings.channelId,
          accessToken: !!user.youtubeSettings.accessToken,
          tokenExpiresAt: user.youtubeSettings.tokenExpiresAt,
        },
      });
    }

    return NextResponse.json({ settings: null });
  } catch (error) {
    console.error("Error loading YouTube settings:", error);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { clientId, clientSecret, defaultPrivacyStatus, defaultTags } = body;

    if (!clientId) {
      return NextResponse.json(
        { error: "Client ID is required" },
        { status: 400 }
      );
    }

    // Auto-generate redirect URI based on the app URL
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/youtube/callback`;

    const user = await getUserByGoogleId(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prepare YouTube settings
    const youtubeSettings = {
      clientId,
      redirectUri,
      defaultPrivacyStatus: defaultPrivacyStatus || "unlisted",
      defaultTags: defaultTags || [],
      // Keep existing encrypted values if clientSecret is not provided
      clientSecret: clientSecret
        ? encrypt(clientSecret)
        : user.youtubeSettings?.clientSecret || "",
      accessToken: user.youtubeSettings?.accessToken,
      refreshToken: user.youtubeSettings?.refreshToken,
      tokenExpiresAt: user.youtubeSettings?.tokenExpiresAt,
      channelId: user.youtubeSettings?.channelId,
    };

    // Validate that we have a client secret
    if (!youtubeSettings.clientSecret) {
      return NextResponse.json(
        { error: "Client Secret is required for initial setup" },
        { status: 400 }
      );
    }

    // Update user with YouTube settings
    console.log("Saving YouTube settings for user:", {
      email: user.email,
      googleId: session.user.id,
      clientId: youtubeSettings.clientId?.substring(0, 20) + "...",
      hasClientSecret: !!youtubeSettings.clientSecret,
      redirectUri: youtubeSettings.redirectUri,
    });

    await updateUser(user._id!.toString(), { youtubeSettings });

    console.log("YouTube settings saved successfully");

    return NextResponse.json({
      success: true,
      message: "YouTube settings saved successfully",
    });
  } catch (error) {
    console.error("Error saving YouTube settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
