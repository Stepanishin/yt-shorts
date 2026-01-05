import { OAuth2Client } from "google-auth-library";
import { getUserByGoogleId, updateUser, type User } from "../db/users";
import { createOAuth2Client, setEncryptedCredentials, refreshAccessToken } from "./youtube-client";
import { encrypt } from "../encryption";

/**
 * Gets an authenticated OAuth2 client for a user with automatic token refresh
 * @param googleId - The user's Google ID (not MongoDB ObjectId)
 */
export async function getUserYouTubeClient(googleId: string): Promise<{ oauth2Client: OAuth2Client; user: User }> {
  const user = await getUserByGoogleId(googleId);

  if (!user) {
    throw new Error("User not found");
  }

  // Проверяем наличие токенов доступа
  if (!user.youtubeSettings?.accessToken) {
    throw new Error("YouTube not connected. Please authorize YouTube access in Settings.");
  }

  // Всегда передаем userSettings, если они есть (для поддержки youtubeProject)
  // createOAuth2Client сам разберется с fallback на глобальные credentials
  const oauth2Client = createOAuth2Client(user.youtubeSettings);

  // Set credentials from database
  setEncryptedCredentials(
    oauth2Client,
    user.youtubeSettings.accessToken,
    user.youtubeSettings.refreshToken
  );

  // Check if token needs refresh (expires in less than 5 minutes)
  const now = new Date();
  const expiresAt = user.youtubeSettings.tokenExpiresAt ? new Date(user.youtubeSettings.tokenExpiresAt) : now;
  const needsRefresh = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

  if (needsRefresh && user.youtubeSettings.refreshToken) {
    console.log("Token expired or expiring soon, refreshing...");

    try {
      const newCredentials = await refreshAccessToken(oauth2Client);

      // Calculate new expiry date
      const newExpiresAt = newCredentials.expiry_date
        ? new Date(newCredentials.expiry_date)
        : new Date(Date.now() + 3600 * 1000);

      // Update tokens in database
      const updatedSettings = {
        ...user.youtubeSettings,
        accessToken: encrypt(newCredentials.access_token!),
        tokenExpiresAt: newExpiresAt,
      };

      // If we got a new refresh token, update it too
      if (newCredentials.refresh_token) {
        updatedSettings.refreshToken = encrypt(newCredentials.refresh_token);
      }

      await updateUser(user._id!.toString(), { youtubeSettings: updatedSettings });

      console.log("Token refreshed successfully");

      // Update user object for return
      user.youtubeSettings = updatedSettings;
    } catch (error) {
      console.error("Failed to refresh token:", error);
      throw new Error("Failed to refresh YouTube access token. Please re-authorize in Settings.");
    }
  }

  return { oauth2Client, user };
}
