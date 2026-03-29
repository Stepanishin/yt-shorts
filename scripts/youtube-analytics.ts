import { config } from "dotenv";
config();

import { google } from "googleapis";
import { createOAuth2Client, setEncryptedCredentials, refreshAccessToken } from "@/lib/youtube/youtube-client";
import { getMongoDatabase } from "@/lib/db/mongodb";
import { encrypt } from "@/lib/encryption";

const CHANNEL_USER_ID = "108150207696954569238"; // Evgenii Stepanishin

async function getAuthenticatedClient() {
  const db = await getMongoDatabase();
  const user = await db.collection("users").findOne({
    googleId: CHANNEL_USER_ID,
  });

  if (!user) {
    throw new Error("User not found in database");
  }

  const settings = user.youtubeSettings;
  if (!settings?.accessToken) {
    throw new Error("YouTube not connected for this user");
  }

  const oauth2Client = createOAuth2Client({
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
  } as any);

  setEncryptedCredentials(
    oauth2Client,
    settings.accessToken,
    settings.refreshToken
  );

  // Refresh token if needed
  const now = new Date();
  const expiresAt = settings.tokenExpiresAt ? new Date(settings.tokenExpiresAt) : now;
  const needsRefresh = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

  if (needsRefresh && settings.refreshToken) {
    console.log("🔄 Refreshing expired token...");
    try {
      const newCredentials = await refreshAccessToken(oauth2Client);
      const newExpiresAt = newCredentials.expiry_date
        ? new Date(newCredentials.expiry_date)
        : new Date(Date.now() + 3600 * 1000);

      const updateData: any = {
        "youtubeSettings.accessToken": encrypt(newCredentials.access_token!),
        "youtubeSettings.tokenExpiresAt": newExpiresAt,
        updatedAt: new Date(),
      };
      if (newCredentials.refresh_token) {
        updateData["youtubeSettings.refreshToken"] = encrypt(newCredentials.refresh_token);
      }
      await db.collection("users").updateOne(
        { googleId: CHANNEL_USER_ID },
        { $set: updateData }
      );
      console.log("✅ Token refreshed successfully\n");
    } catch (error) {
      console.error("❌ Failed to refresh token. Please re-authorize.");
      throw error;
    }
  }

  return oauth2Client;
}

async function getRecentVideos(oauth2Client: any, fromDate: Date, toDate: Date) {
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  // Get uploads playlist ID
  const channelRes = await youtube.channels.list({
    mine: true,
    part: ["contentDetails", "snippet"],
  });

  const channelTitle = channelRes.data.items?.[0]?.snippet?.title;
  console.log(`📺 Channel: ${channelTitle}\n`);

  const uploadsPlaylistId =
    channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("Could not find uploads playlist");

  // Fetch enough videos to cover the date range
  const allItems: any[] = [];
  let nextPageToken: string | undefined;
  let reachedOldEnough = false;

  while (!reachedOldEnough) {
    const playlistRes: any = await youtube.playlistItems.list({
      playlistId: uploadsPlaylistId,
      part: ["snippet"],
      maxResults: 50,
      pageToken: nextPageToken,
    });

    const items = playlistRes.data.items || [];
    allItems.push(...items);

    // Check if oldest item in this batch is before our fromDate
    const oldestDate = items.length > 0
      ? new Date(items[items.length - 1].snippet?.publishedAt)
      : new Date();

    if (oldestDate < fromDate || !playlistRes.data.nextPageToken) {
      reachedOldEnough = true;
    }
    nextPageToken = playlistRes.data.nextPageToken;
  }

  // Filter by date range
  const filteredItems = allItems.filter((item: any) => {
    const pubDate = new Date(item.snippet?.publishedAt);
    return pubDate >= fromDate && pubDate <= toDate;
  });

  const videoIds = filteredItems
    .map((item: any) => item.snippet?.resourceId?.videoId)
    .filter(Boolean);

  console.log(`   Found ${videoIds.length} videos between ${fromDate.toISOString().split("T")[0]} and ${toDate.toISOString().split("T")[0]}\n`);

  if (videoIds.length === 0) return [];

  // Get video details in batches of 50
  const allVideos: any[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const videosRes = await youtube.videos.list({
      id: batch,
      part: ["snippet", "statistics", "contentDetails"],
    });
    allVideos.push(...(videosRes.data.items || []));
  }

  return allVideos;
}

async function getAnalyticsData(oauth2Client: any) {
  const youtubeAnalytics = google.youtubeAnalytics({
    version: "v2",
    auth: oauth2Client,
  });

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  console.log(`📊 Fetching analytics from ${startDate} to ${endDate}...\n`);

  // 1. Overall channel metrics
  let channelMetrics;
  try {
    channelMetrics = await youtubeAnalytics.reports.query({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,likes,shares",
    });
  } catch (e: any) {
    console.log("⚠️  YouTube Analytics API error:", e.message?.substring(0, 200));
    console.log("   Make sure yt-analytics.readonly scope is granted and YouTube Analytics API is enabled.\n");
    return null;
  }

  // 2. Top videos by views
  const topVideos = await youtubeAnalytics.reports.query({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,shares",
    dimensions: "video",
    sort: "-views",
    maxResults: 10,
  });

  // 3. Worst videos by views
  const worstVideos = await youtubeAnalytics.reports.query({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,shares",
    dimensions: "video",
    sort: "views",
    maxResults: 10,
  });

  // 4. Traffic sources
  const trafficSources = await youtubeAnalytics.reports.query({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched",
    dimensions: "insightTrafficSourceType",
    sort: "-views",
  });

  // 5. Countries
  const countries = await youtubeAnalytics.reports.query({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched,averageViewDuration",
    dimensions: "country",
    sort: "-views",
    maxResults: 20,
  });

  return {
    channelMetrics,
    topVideos,
    worstVideos,
    trafficSources,
    countries,
  };
}

async function main() {
  console.log("🎬 BOMBAZO España — YouTube Analytics\n");
  console.log("=".repeat(70));

  const oauth2Client = await getAuthenticatedClient();
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  // ===== PART 1: Video Data (YouTube Data API) =====
  // Date range: last month excluding last 7 days (to let views stabilize)
  const toDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  const fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days before that

  console.log(`\n📹 VIDEOS: ${fromDate.toISOString().split("T")[0]} → ${toDate.toISOString().split("T")[0]} (excluding last 7 days)\n`);

  const videos = await getRecentVideos(oauth2Client, fromDate, toDate);

  const videoData = videos.map((v: any) => ({
    id: v.id,
    title: v.snippet?.title?.substring(0, 60),
    publishedAt: v.snippet?.publishedAt?.substring(0, 10),
    views: parseInt(v.statistics?.viewCount || "0"),
    likes: parseInt(v.statistics?.likeCount || "0"),
    comments: parseInt(v.statistics?.commentCount || "0"),
    duration: v.contentDetails?.duration,
  }));

  // Sort by views desc for display
  const sorted = [...videoData].sort((a, b) => b.views - a.views);

  console.log("Top 10 por views:");
  console.log("-".repeat(70));
  sorted.slice(0, 10).forEach((v, i) => {
    console.log(
      `${i + 1}. ${v.views.toLocaleString().padStart(8)} views | ${v.likes} likes | ${v.publishedAt} | ${v.title}`
    );
  });

  console.log("\nWorst 10 por views:");
  console.log("-".repeat(70));
  sorted.slice(-10).reverse().forEach((v, i) => {
    console.log(
      `${i + 1}. ${v.views.toLocaleString().padStart(8)} views | ${v.likes} likes | ${v.publishedAt} | ${v.title}`
    );
  });

  // Stats summary
  const totalViews = videoData.reduce((s: number, v: any) => s + v.views, 0);
  const avgViews = Math.round(totalViews / videoData.length);
  const maxViews = Math.max(...videoData.map((v: any) => v.views));
  const minViews = Math.min(...videoData.map((v: any) => v.views));
  const medianViews = videoData.length > 0
    ? [...videoData].sort((a, b) => a.views - b.views)[Math.floor(videoData.length / 2)].views
    : 0;

  console.log(`\n📊 RESUMEN (${videoData.length} videos):`);
  console.log(`   Total views: ${totalViews.toLocaleString()}`);
  console.log(`   Average: ${avgViews.toLocaleString()}`);
  console.log(`   Median: ${medianViews.toLocaleString()}`);
  console.log(`   Max: ${maxViews.toLocaleString()}`);
  console.log(`   Min: ${minViews.toLocaleString()}`);

  // ===== PART 2: Analytics API data =====
  console.log("\n" + "=".repeat(70));
  console.log("📈 YOUTUBE ANALYTICS (last 90 days)\n");

  const analytics = await getAnalyticsData(oauth2Client);

  if (analytics) {
    // Channel metrics
    const cm = analytics.channelMetrics?.data?.rows?.[0];
    if (cm) {
      console.log("🔢 MÉTRICAS GENERALES:");
      console.log(`   Views: ${Number(cm[0]).toLocaleString()}`);
      console.log(`   Watch time (min): ${Number(cm[1]).toLocaleString()}`);
      console.log(`   Avg view duration: ${Number(cm[2]).toFixed(1)} seconds`);
      console.log(`   Subscribers gained: ${Number(cm[3]).toLocaleString()}`);
      console.log(`   Likes: ${Number(cm[4]).toLocaleString()}`);
      console.log(`   Shares: ${Number(cm[5]).toLocaleString()}`);
    }

    // Top videos with retention
    const topRows = analytics.topVideos?.data?.rows;
    if (topRows && topRows.length > 0) {
      console.log("\n🏆 TOP 10 VIDEOS (by views, with retention):");
      console.log("-".repeat(70));

      // Resolve video titles
      const topIds = topRows.map((r: any) => r[0]);
      const titlesRes = await youtube.videos.list({
        id: topIds,
        part: ["snippet"],
      });
      const titleMap: Record<string, string> = {};
      titlesRes.data.items?.forEach((v: any) => {
        titleMap[v.id!] = v.snippet?.title?.substring(0, 50) || v.id!;
      });

      topRows.forEach((row: any, i: number) => {
        const [videoId, views, watchMin, avgDuration, likes, shares] = row;
        console.log(
          `${i + 1}. ${Number(views).toLocaleString().padStart(8)} views | ` +
          `${Number(avgDuration).toFixed(1)}s avg | ` +
          `${likes} likes | ` +
          `${titleMap[videoId] || videoId}`
        );
      });
    }

    // Worst videos
    const worstRows = analytics.worstVideos?.data?.rows;
    if (worstRows && worstRows.length > 0) {
      console.log("\n💀 WORST 10 VIDEOS (by views):");
      console.log("-".repeat(70));

      const worstIds = worstRows.map((r: any) => r[0]);
      const titlesRes2 = await youtube.videos.list({
        id: worstIds,
        part: ["snippet"],
      });
      const titleMap2: Record<string, string> = {};
      titlesRes2.data.items?.forEach((v: any) => {
        titleMap2[v.id!] = v.snippet?.title?.substring(0, 50) || v.id!;
      });

      worstRows.forEach((row: any, i: number) => {
        const [videoId, views, watchMin, avgDuration, likes, shares] = row;
        console.log(
          `${i + 1}. ${Number(views).toLocaleString().padStart(8)} views | ` +
          `${Number(avgDuration).toFixed(1)}s avg | ` +
          `${likes} likes | ` +
          `${titleMap2[videoId] || videoId}`
        );
      });
    }

    // Traffic sources
    const trafficRows = analytics.trafficSources?.data?.rows;
    if (trafficRows) {
      console.log("\n🚦 TRAFFIC SOURCES:");
      console.log("-".repeat(70));
      trafficRows.forEach((row: any) => {
        const [source, views, watchMin] = row;
        console.log(
          `   ${source.padEnd(30)} ${Number(views).toLocaleString().padStart(10)} views | ${Number(watchMin).toLocaleString()} min`
        );
      });
    }

    // Countries
    const countryRows = analytics.countries?.data?.rows;
    if (countryRows) {
      console.log("\n🌍 TOP COUNTRIES:");
      console.log("-".repeat(70));
      countryRows.forEach((row: any) => {
        const [country, views, watchMin, avgDuration] = row;
        console.log(
          `   ${country.padEnd(5)} ${Number(views).toLocaleString().padStart(10)} views | ${Number(avgDuration).toFixed(1)}s avg duration`
        );
      });
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ Done!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err.message || err);
    process.exit(1);
  });
