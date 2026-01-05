import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { decrypt } from "../encryption";
import type { YouTubeSettings } from "../db/users";

const youtube = google.youtube("v3");

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Создает OAuth2 клиент для YouTube с пользовательскими настройками
 */
export function createOAuth2Client(userSettings?: YouTubeSettings): OAuth2Client {
  let clientId: string;
  let clientSecret: string;

  // redirectUri ВСЕГДА берется из environment variables, так как это системная настройка окружения
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/youtube/callback`;

  if (userSettings) {
    // Check which YouTube project to use
    const useProject2 = userSettings.youtubeProject === 2;

    if (useProject2) {
      // Use Project 2 credentials from environment
      clientId = process.env.YOUTUBE_PROJECT_2_CLIENT_ID || "";
      clientSecret = process.env.YOUTUBE_PROJECT_2_CLIENT_SECRET || "";

      if (!clientId || !clientSecret) {
        throw new Error("YouTube Project 2 credentials not configured in environment variables.");
      }
    } else {
      // Use user-specific settings or Project 1 credentials
      clientId = userSettings.clientId || process.env.YOUTUBE_CLIENT_ID || "";
      clientSecret = userSettings.clientSecret ? decrypt(userSettings.clientSecret) : process.env.YOUTUBE_CLIENT_SECRET || "";
    }
  } else {
    // Fallback to environment variables for backward compatibility (Project 1)
    clientId = process.env.YOUTUBE_CLIENT_ID || "";
    clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
  }

  if (!clientId || !clientSecret) {
    throw new Error("YouTube credentials not configured. Please configure OAuth settings in your account settings.");
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
  channelId?: string; // Optional: specific YouTube channel ID (for users with multiple channels)
  language?: "es" | "de" | "pt" | string; // Optional: video language (defaults to "es" for backward compatibility)
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
    channelId,
    language = "es", // Default to Spanish for backward compatibility
  } = options;

  const fs = require("fs");

  try {
    // Build request body
    const requestBody: any = {
      snippet: {
        title,
        description,
        tags,
        categoryId,
        defaultLanguage: language,
        defaultAudioLanguage: language,
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    };

    // If channelId is specified, upload to that specific channel
    if (channelId) {
      requestBody.snippet.channelId = channelId;
    }

    const response = await youtube.videos.insert({
      auth: oauth2Client,
      part: ["snippet", "status"],
      requestBody,
      media: {
        body: fs.createReadStream(videoPath),
      },
    });

    const videoId = response.data.id;
    if (!videoId) {
      throw new Error("YouTube API did not return a video ID");
    }

    return {
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
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

/**
 * Refreshes access token using refresh token
 */
export async function refreshAccessToken(oauth2Client: OAuth2Client) {
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    return credentials;
  } catch (error) {
    console.error("Token refresh error:", error);
    throw error;
  }
}

/**
 * Sets credentials on OAuth2 client with encrypted tokens
 */
export function setEncryptedCredentials(oauth2Client: OAuth2Client, encryptedAccessToken: string, encryptedRefreshToken?: string) {
  const credentials: any = {
    access_token: decrypt(encryptedAccessToken),
  };

  if (encryptedRefreshToken) {
    credentials.refresh_token = decrypt(encryptedRefreshToken);
  }

  oauth2Client.setCredentials(credentials);
}

/**
 * Получает список YouTube каналов пользователя
 */
export interface YouTubeChannel {
  id: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
}

export async function getUserYouTubeChannels(oauth2Client: OAuth2Client): Promise<YouTubeChannel[]> {
  try {
    const response = await youtube.channels.list({
      auth: oauth2Client,
      part: ["snippet", "contentDetails"],
      mine: true,
    });

    if (!response.data.items || response.data.items.length === 0) {
      return [];
    }

    return response.data.items.map((channel) => ({
      id: channel.id!,
      title: channel.snippet?.title || "Unnamed Channel",
      customUrl: channel.snippet?.customUrl || undefined,
      thumbnailUrl: channel.snippet?.thumbnails?.default?.url || undefined,
    }));
  } catch (error) {
    console.error("Error fetching YouTube channels:", error);
    throw error;
  }
}
