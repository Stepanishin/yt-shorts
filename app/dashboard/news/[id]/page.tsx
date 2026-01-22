"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface NewsData {
  _id?: string;
  source: string;
  title: string;
  summary: string;
  imageUrl: string;
  url: string;
  editedTitle?: string;
  editedSummary?: string;
  editedImageUrl?: string;
  category?: string;
  author?: string;
  publishedDate?: string;
  status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
  createdAt?: string;
}

export default function NewsDetailPage() {
  const params = useParams();
  const [news, setNews] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedSummary, setEditedSummary] = useState("");
  const [editedImageUrl, setEditedImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const id = params?.id as string;

  useEffect(() => {
    if (!id) return;

    const loadNews = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/news-ingest/queue?limit=1000`);
        if (!response.ok) {
          throw new Error("Failed to load news");
        }
        const data = await response.json();
        const newsItem = data.news.find((n: NewsData) => n._id === id);

        if (!newsItem) {
          throw new Error("News not found");
        }

        setNews(newsItem);
        setEditedTitle(newsItem.editedTitle || newsItem.title);
        setEditedSummary(newsItem.editedSummary || newsItem.summary);
        setEditedImageUrl(newsItem.editedImageUrl || newsItem.imageUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Failed to load news:", err);
      } finally {
        setLoading(false);
      }
    };

    loadNews();
  }, [id]);

  const handleSave = async () => {
    if (!news?._id) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/news-ingest/queue`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: news._id,
          editedTitle: editedTitle !== news.title ? editedTitle : undefined,
          editedSummary: editedSummary !== news.summary ? editedSummary : undefined,
          editedImageUrl: editedImageUrl !== news.imageUrl ? editedImageUrl : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save changes");
      }

      // Update local state
      setNews({
        ...news,
        editedTitle: editedTitle !== news.title ? editedTitle : news.editedTitle,
        editedSummary: editedSummary !== news.summary ? editedSummary : news.editedSummary,
        editedImageUrl: editedImageUrl !== news.imageUrl ? editedImageUrl : news.editedImageUrl,
      });

      setIsEditing(false);
      console.log("Changes saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!news?._id) return;

    if (!confirm("Are you sure you want to delete this news item? It will be marked as deleted and won't appear in the list.")) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      // For now, we'll just mark it as deleted by updating status
      // You can implement DELETE endpoint if needed
      alert("Delete functionality not implemented yet. Please use PATCH to change status to 'deleted'");

    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Failed to delete:", err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading news...</div>
      </div>
    );
  }

  if (error && !news) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="text-red-800 font-medium mb-2">Error</div>
            <div className="text-red-600 text-sm mb-3">{error}</div>
            <Link
              href="/dashboard/news"
              className="text-blue-600 hover:text-blue-700 underline"
            >
              Return to list
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!news) {
    return null;
  }

  const statusLabels: Record<string, string> = {
    pending: "Pending",
    reserved: "Reserved",
    used: "Used",
    rejected: "Rejected",
    deleted: "Deleted",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-800",
    reserved: "bg-blue-100 text-blue-800",
    used: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    deleted: "bg-gray-200 text-gray-600",
  };

  const formatDate = (date?: string) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/dashboard/news"
            className="inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            ← Back to list
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting || news.status === "deleted"}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
          >
            {deleting ? "Deleting..." : news.status === "deleted" ? "Deleted" : "🗑️ Delete news"}
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          {/* Header and metadata */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">
                DiezMinutos
              </span>
              {news.category && (
                <span className="text-xs text-gray-500">• {news.category}</span>
              )}
            </div>
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full ${
                statusColors[news.status ?? "pending"] ?? statusColors.pending
              }`}
            >
              {statusLabels[news.status ?? "pending"] ?? news.status}
            </span>
          </div>

          {/* Celebrity Image */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Celebrity Image</h3>
            {isEditing ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={editedImageUrl}
                  onChange={(e) => setEditedImageUrl(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Image URL..."
                />
                {editedImageUrl && (
                  <img
                    src={editedImageUrl}
                    alt="Preview"
                    className="w-full max-w-md rounded-lg border border-gray-300"
                  />
                )}
              </div>
            ) : (
              <img
                src={news.editedImageUrl || news.imageUrl}
                alt={news.title}
                className="w-full max-w-md rounded-lg border border-gray-300"
              />
            )}
          </div>

          {/* Title */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Title</h3>
            {isEditing ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md text-gray-900 text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="News title..."
              />
            ) : (
              <div className="text-2xl font-bold text-gray-900">
                {news.editedTitle || news.title}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-medium text-gray-900">Summary</h3>
              <button
                onClick={() => setIsEditing(!isEditing)}
                disabled={news.status === "deleted"}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isEditing ? "Cancel editing" : "Edit news"}
              </button>
            </div>
            {isEditing ? (
              <div className="space-y-4">
                <textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md text-gray-900 text-base leading-relaxed min-h-[150px] resize-y focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="News summary..."
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedTitle(news?.editedTitle || news?.title || "");
                      setEditedSummary(news?.editedSummary || news?.summary || "");
                      setEditedImageUrl(news?.editedImageUrl || news?.imageUrl || "");
                    }}
                    disabled={saving}
                    className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-base text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-md border border-gray-200">
                {news.editedSummary || news.summary}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="border-t pt-6 space-y-2 text-sm text-gray-600">
            {news.author && <div><strong>Author:</strong> {news.author}</div>}
            {news.publishedDate && (
              <div><strong>Published:</strong> {formatDate(news.publishedDate)}</div>
            )}
            {news.createdAt && (
              <div><strong>Added to system:</strong> {formatDate(news.createdAt)}</div>
            )}
            {news.url && (
              <div>
                <strong>Original URL:</strong>{" "}
                <a
                  href={news.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  View on DiezMinutos
                </a>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="text-red-800 font-medium mb-1">Error</div>
              <div className="text-red-600 text-sm">{error}</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
