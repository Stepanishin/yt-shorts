/**
 * Минимальный клиент Twitch Helix API для получения клипов.
 * Docs: https://dev.twitch.tv/docs/api/reference/#get-clips
 */

export interface TwitchClip {
  id: string;
  url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_name: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
  language: string;
  vod_offset: number | null;
}

const HELIX = "https://api.twitch.tv/helix";

let cachedToken: { token: string; expiresAt: number } | null = null;

function getCredentials() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are not set. Create an app at https://dev.twitch.tv/console/apps"
    );
  }
  return { clientId, clientSecret };
}

async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Twitch token request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export async function helix<T>(path: string, params: Record<string, string>): Promise<T> {
  const { clientId } = getCredentials();
  const token = await getAppToken();
  const url = `${HELIX}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Twitch ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function getBroadcasterId(login: string): Promise<string | null> {
  const data = await helix<{ data: { id: string }[] }>("/users", { login });
  return data.data[0]?.id ?? null;
}

/**
 * Клипы стримера за период. Helix отдаёт их отсортированными по view_count (по убыванию).
 */
export async function getTopClips(
  broadcasterId: string,
  since: Date,
  first = 50
): Promise<TwitchClip[]> {
  const data = await helix<{ data: TwitchClip[] }>("/clips", {
    broadcaster_id: broadcasterId,
    started_at: since.toISOString(),
    ended_at: new Date().toISOString(),
    first: String(Math.min(first, 100)),
  });
  return data.data;
}
