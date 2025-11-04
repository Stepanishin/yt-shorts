import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

const youtube = google.youtube("v3");

/**
 * Создает OAuth2 клиент для YouTube
 */
export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/youtube/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("YouTube credentials not configured. Please set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Генерирует URL для авторизации YouTube
 */
export function getAuthUrl(oauth2Client: OAuth2Client): string {
  const scopes = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
  ];

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent", // Заставляет Google показывать consent screen каждый раз
  });
}

/**
 * Получает токены из кода авторизации
 */
export async function getTokensFromCode(oauth2Client: OAuth2Client, code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

/**
 * Загружает видео на YouTube
 */
export interface UploadVideoOptions {
  oauth2Client: OAuth2Client;
  videoPath: string;
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: "private" | "public" | "unlisted";
}

export async function uploadVideoToYouTube(options: UploadVideoOptions) {
  const {
    oauth2Client,
    videoPath,
    title,
    description,
    tags = [],
    categoryId = "23", // 23 = Comedy
    privacyStatus = "public",
  } = options;

  const fs = require("fs");

  try {
    const response = await youtube.videos.insert({
      auth: oauth2Client,
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title,
          description,
          tags,
          categoryId,
          defaultLanguage: "es",
          defaultAudioLanguage: "es",
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    });

    return {
      videoId: response.data.id,
      videoUrl: `https://www.youtube.com/watch?v=${response.data.id}`,
      title: response.data.snippet?.title,
    };
  } catch (error) {
    console.error("YouTube upload error:", error);
    throw error;
  }
}

/**
 * Проверяет валидность токенов
 */
export async function validateTokens(oauth2Client: OAuth2Client): Promise<boolean> {
  try {
    await oauth2Client.getAccessToken();
    return true;
  } catch {
    return false;
  }
}
