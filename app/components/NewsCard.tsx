"use client";

import Link from "next/link";
import { NewsCandidate } from "@/lib/ingest-news/types";

interface NewsCardProps {
  news: NewsCandidate & {
    _id?: string;
    createdAt?: string;
    status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
    publishedAt?: string;
    editedTitle?: string;
    editedSummary?: string;
  };
  onUpdate?: () => void;
}

export default function NewsCard({ news }: NewsCardProps) {
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

  const formatDate = (date?: Date | string) => {
    if (!date) return "N/A";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Link href={`/dashboard/news/${news._id}`}>
      <div className="bg-white rounded-lg border border-gray-200 hover:border-blue-400 transition-colors p-5 cursor-pointer">
        <div className="flex gap-4">
          {/* Celebrity Image */}
          {news.imageUrl && (
            <div className="flex-shrink-0">
              <img
                src={news.imageUrl}
                alt={news.title}
                className="w-32 h-32 object-cover rounded-md"
              />
            </div>
          )}

          {/* News Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="font-medium">DiezMinutos</span>
                {news.category && (
                  <span className="text-xs text-gray-500">• {news.category}</span>
                )}
                {news.publishedDate && (
                  <span className="text-xs text-gray-500">
                    • {formatDate(news.publishedDate)}
                  </span>
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

            {/* Title */}
            <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
              {news.editedTitle || news.title}
            </h3>

            {/* Summary */}
            <p className="text-sm text-gray-600 line-clamp-3 mb-3">
              {news.editedSummary || news.summary}
            </p>

            {/* Metadata */}
            <div className="flex gap-4 text-xs text-gray-500">
              {news.author && <span>By {news.author}</span>}
              {news.createdAt && (
                <span>Added {formatDate(news.createdAt)}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
