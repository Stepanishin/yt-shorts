import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getAutoGenerationConfig,
  saveAutoGenerationConfig,
  deleteAutoGenerationConfig,
  AutoGenerationConfig,
} from "@/lib/db/auto-generation";
import { getUserByGoogleId } from "@/lib/db/users";

/**
 * GET /api/auto-generation/config
 * Get current auto-generation configuration for the user
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

    const config = await getAutoGenerationConfig(user._id!.toString());

    // Migration: Update old color values and duration to new defaults
    let needsMigration = false;
    let migratedConfig = config;

    if (config?.template?.text) {
      const needsColorMigration = 
        config.template.text.color === "white@1" && 
        config.template.text.backgroundColor === "black@0.6";
      
      const needsDurationMigration = config.template.audio?.duration === 20;

      if (needsColorMigration || needsDurationMigration) {
        needsMigration = true;
        migratedConfig = {
          ...config,
          template: {
            ...config.template,
            text: needsColorMigration ? {
              ...config.template.text,
              color: "black@1",
              backgroundColor: "white@0.6",
            } : config.template.text,
            audio: needsDurationMigration ? {
              ...config.template.audio,
              duration: 5,
            } : config.template.audio,
          },
        };
        
        // Save migrated config back to database
        await saveAutoGenerationConfig(migratedConfig);
      }
    }

    if (needsMigration) {
      // Return migrated config
      return NextResponse.json({
        success: true,
        config: migratedConfig,
      });
    }

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error("Error fetching auto-generation config:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auto-generation/config
 * Create or update auto-generation configuration
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

    // Validation
    if (body.videosPerDay && (body.videosPerDay < 1 || body.videosPerDay > 10)) {
      return NextResponse.json(
        { error: "videosPerDay must be between 1 and 10" },
        { status: 400 }
      );
    }

    if (body.publishTimes && !Array.isArray(body.publishTimes)) {
      return NextResponse.json(
        { error: "publishTimes must be an array" },
        { status: 400 }
      );
    }

    // Validate publish times
    if (body.publishTimes) {
      for (const time of body.publishTimes) {
        if (
          typeof time.hour !== "number" ||
          time.hour < 0 ||
          time.hour > 23 ||
          typeof time.minute !== "number" ||
          time.minute < 0 ||
          time.minute > 59
        ) {
          return NextResponse.json(
            { error: "Invalid publish time format" },
            { status: 400 }
          );
        }
      }
    }

    // Get existing config to preserve _id
    const existingConfig = await getAutoGenerationConfig(user._id!.toString());

    // Prepare template with migration for old color values
    const templateBase = body.template ?? existingConfig?.template ?? {
      text: {
        fontSize: 29,
        color: "black@1",
        backgroundColor: "white@0.6",
        boxPadding: 15,
        fontWeight: "bold",
        position: { x: 360, y: 200 },
        width: 600,
        lineSpacing: 12,
      },
      gif: {
        urls: [],
        position: "bottom-right",
        width: 300,
        height: 300,
      },
      audio: {
        urls: [],
        randomTrim: true,
        duration: 5,
      },
      background: {
        unsplashKeywords: ["funny", "humor", "comedy"],
        imageEffect: "zoom-in-out",
      },
    };

    // Migration: Update old color values and duration to new defaults
    let template = templateBase;
    const needsColorMigration = template.text && template.text.color === "white@1" && template.text.backgroundColor === "black@0.6";
    const needsDurationMigration = template.audio && template.audio.duration === 20;

    if (needsColorMigration || needsDurationMigration) {
      template = {
        ...template,
        text: needsColorMigration ? {
          ...template.text,
          color: "black@1",
          backgroundColor: "white@0.6",
        } : template.text,
        audio: needsDurationMigration ? {
          ...template.audio,
          duration: 5,
        } : template.audio,
      };
    }

    const configData: any = {
      userId: user._id!.toString(),
      isEnabled: body.isEnabled ?? false,
      videosPerDay: body.videosPerDay ?? 1,
      publishTimes: body.publishTimes ?? [],
      template: template,
      youtube: body.youtube ?? {
        privacyStatus: "public",
        tags: [],
        useAI: false,
      },
      stats: existingConfig?.stats ?? {
        totalGenerated: 0,
        totalPublished: 0,
      },
    };

    // If updating, preserve _id
    if (existingConfig?._id) {
      configData._id = existingConfig._id;
    }

    const savedConfig = await saveAutoGenerationConfig(configData);

    return NextResponse.json({
      success: true,
      config: savedConfig,
      message: existingConfig
        ? "Configuration updated successfully"
        : "Configuration created successfully",
    });
  } catch (error) {
    console.error("Error saving auto-generation config:", error);
    return NextResponse.json(
      { error: "Failed to save configuration" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auto-generation/config
 * Delete auto-generation configuration
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByGoogleId(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const deleted = await deleteAutoGenerationConfig(user._id!.toString());

    if (!deleted) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Configuration deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting auto-generation config:", error);
    return NextResponse.json(
      { error: "Failed to delete configuration" },
      { status: 500 }
    );
  }
}
