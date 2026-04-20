"use client";

import { useEffect, useState } from "react";
import { NewsCandidate } from "@/lib/ingest-news/types";
import NewsCard from "./NewsCard";

interface NewsListItemSL extends NewsCandidate {
  _id?: string;
  createdAt?: string;
  status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
  reservedAt?: string;
  usedAt?: string;
  publishedAt?: string;
  notes?: string;
  editedTitle?: string;
  editedSummary?: string;
  editedImageUrl?: string;
}

export default function NewsListSL() {
  const [news, setNews] = useState<NewsListItemSL[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState<{
    totalFetched: number;
    totalInserted: number;
    totalDeleted: number;
  } | null>(null);

  const loadNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/news-ingest-sl/queue?limit=100");
      if (!response.ok) {
        throw new Error("Failed to load Slovenian news");
      }
      const data = await response.json();
      setNews(data.news ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Failed to load Slovenian news:", err);
    } finally {
      setLoading(false);
    }
  };

  const collectNews = async () => {
    setCollecting(true);
    setError(null);
    setCollectResult(null);
    try {
      const response = await fetch("/api/news-ingest-sl/run", {
        method: "POST",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to collect Slovenian news");
      }
      const result = await response.json();
      setCollectResult({
        totalFetched: result.totalFetched ?? 0,
        totalInserted: result.totalInserted ?? 0,
        totalDeleted: result.totalDeleted ?? 0,
      });
      await loadNews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Failed to collect Slovenian news:", err);
    } finally {
      setCollecting(false);
    }
  };

  useEffect(() => {
    loadNews();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading Slovenian news...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="text-red-800 font-medium mb-2">Error</div>
        <div className="text-red-600 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex gap-3 flex-wrap items-center">
        <button
          onClick={collectNews}
          disabled={collecting}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
        >
          {collecting ? "Collecting Slovenian news from 24ur & Govori.se..." : "📰 Collect Slovenian News"}
        </button>
      </div>

      {collectResult && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="text-green-800 font-medium mb-2">
            Slovenian news collection completed!
          </div>
          <div className="text-green-700 text-sm space-y-1">
            <div>Fetched: {collectResult.totalFetched} news items</div>
            <div>New items inserted: {collectResult.totalInserted}</div>
            <div>Old items deleted: {collectResult.totalDeleted}</div>
          </div>
        </div>
      )}

      <div className="mb-4 text-sm text-gray-600">
        Total Slovenian news: {news.length}
      </div>

      {news.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No Slovenian news found. Click &quot;Collect Slovenian News&quot; to fetch from 24ur.com and Govori.se
        </div>
      ) : (
        <div className="grid gap-4">
          {news.map((item) => (
            <NewsCard
              key={item._id}
              news={item}
              onUpdate={loadNews}
              basePath="/dashboard/news-sl"
            />
          ))}
        </div>
      )}
    </div>
  );
}
