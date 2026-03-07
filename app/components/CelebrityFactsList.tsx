"use client";

import { useEffect, useState } from "react";
import { StoredCelebrityFact } from "@/lib/celebrity-facts/types";

type FactItem = StoredCelebrityFact & { _id: string; createdAt: string };

export default function CelebrityFactsList() {
  const [facts, setFacts] = useState<FactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadFacts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/celebrity-facts?limit=100");
      if (!response.ok) throw new Error("Failed to load facts");
      const data = await response.json();
      setFacts(data.facts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const deleteFact = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/celebrity-facts?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete");
      setFacts((prev) => prev.filter((f) => f._id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    loadFacts();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-gray-600">Loading facts...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-600 text-sm">{facts.length} facts in queue</p>
        <button
          onClick={loadFacts}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {facts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No celebrity facts yet. Your agent will add them via POST /api/celebrity-facts
        </div>
      ) : (
        <div className="space-y-4">
          {facts.map((fact) => (
            <div
              key={fact._id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        fact.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : fact.status === "reserved"
                          ? "bg-blue-100 text-blue-700"
                          : fact.status === "used"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {fact.status ?? "pending"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(fact.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <h3 className="font-semibold text-gray-900 text-base mb-2">{fact.title}</h3>
                  <p className="text-gray-700 text-sm mb-3 leading-relaxed">{fact.text}</p>

                  <div className="flex flex-wrap gap-1 mb-3">
                    {fact.imageHashtags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-block bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="space-y-1">
                    {fact.sourceLinks.map((link, i) => (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-blue-600 hover:underline truncate"
                      >
                        {link}
                      </a>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => deleteFact(fact._id)}
                  disabled={deletingId === fact._id}
                  className="shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
