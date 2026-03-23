"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface SearchResult {
  title: string;
  url: string;
}

interface ArticlePreview {
  title: string;
  summary: string;
  imageUrl: string;
  url: string;
}

export default function NewsSearchPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());
  const [addResults, setAddResults] = useState<
    Record<string, { success: boolean; article?: ArticlePreview; error?: string }>
  >({});

  if (!session?.user?.isAdmin) {
    router.push("/dashboard");
    return null;
  }

  const handleSearch = async () => {
    if (!query.trim() || query.trim().length < 2) return;

    setSearching(true);
    setSearchError("");
    setResults([]);
    setAddResults({});
    setAddedUrls(new Set());

    try {
      const res = await fetch(
        `/api/news-search?q=${encodeURIComponent(query.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        setSearchError(data.error || "Search failed");
        return;
      }

      setResults(data.results || []);
      if (data.results?.length === 0) {
        setSearchError("No articles found on hola.com for this query");
      }
    } catch {
      setSearchError("Network error");
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (url: string) => {
    setAddingUrl(url);

    try {
      const res = await fetch("/api/news-search/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAddResults((prev) => ({
          ...prev,
          [url]: { success: false, error: data.error },
        }));
        return;
      }

      setAddedUrls((prev) => new Set(prev).add(url));
      setAddResults((prev) => ({
        ...prev,
        [url]: { success: true, article: data.article },
      }));
    } catch {
      setAddResults((prev) => ({
        ...prev,
        [url]: { success: false, error: "Network error" },
      }));
    } finally {
      setAddingUrl(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Search News on Hola.com
        </h1>

        {/* Search bar */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Enter celebrity name (e.g. Amanda Miguel, Rocío Dúrcal)..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {searching ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Searching...
              </span>
            ) : (
              "Search"
            )}
          </button>
        </div>

        {/* Error */}
        {searchError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {searchError}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-4">
              Found {results.length} articles on hola.com
            </p>

            {results.map((result) => {
              const isAdded = addedUrls.has(result.url);
              const isAdding = addingUrl === result.url;
              const addResult = addResults[result.url];

              return (
                <div
                  key={result.url}
                  className="bg-white rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 mb-1">
                        {result.title}
                      </h3>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline break-all"
                      >
                        {result.url}
                      </a>

                      {/* Add result message */}
                      {addResult && (
                        <div
                          className={`mt-2 text-sm ${
                            addResult.success
                              ? "text-green-700"
                              : "text-red-700"
                          }`}
                        >
                          {addResult.success
                            ? `Added: "${addResult.article?.title}"`
                            : `Error: ${addResult.error}`}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleAdd(result.url)}
                      disabled={isAdding || isAdded}
                      className={`flex-shrink-0 px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                        isAdded
                          ? "bg-green-100 text-green-800 cursor-default"
                          : isAdding
                          ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {isAdded
                        ? "Added"
                        : isAdding
                        ? "Adding..."
                        : "Add to DB"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
