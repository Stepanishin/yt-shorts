"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

interface RedditMeme {
  _id: string;
  subreddit: string;
  title: string;
  imageUrl: string;
  redditUrl: string;
  externalId: string;
  author: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  publishedDate: string;
  status: string;
  createdAt: string;
  editedTitle?: string;
  editedImageUrl?: string;
}

interface Stats {
  pending: number;
  reserved: number;
  used: number;
}

export default function MemesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [memes, setMemes] = useState<RedditMeme[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, reserved: 0, used: 0 });
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [lastResult, setLastResult] = useState<{ fetched: number; inserted: number } | null>(null);

  const fetchMemes = useCallback(async () => {
    try {
      const response = await fetch("/api/reddit-ingest/queue?limit=100");
      const data = await response.json();
      if (data.success) {
        setMemes(data.memes);
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Error fetching memes:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user?.isAdmin) {
      router.push("/dashboard");
      return;
    }
    fetchMemes();
  }, [session, status, router, fetchMemes]);

  const handleCollect = async () => {
    setCollecting(true);
    setLastResult(null);
    try {
      const response = await fetch("/api/reddit-ingest/run", { method: "POST" });
      const data = await response.json();
      if (data.success) {
        setLastResult({
          fetched: data.data.totalFetched,
          inserted: data.data.totalInserted,
        });
        await fetchMemes();
      }
    } catch (error) {
      console.error("Error collecting memes:", error);
    } finally {
      setCollecting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this meme?")) return;
    try {
      await fetch("/api/reddit-ingest/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await fetchMemes();
    } catch (error) {
      console.error("Error deleting meme:", error);
    }
  };

  const filteredMemes = filter === "all"
    ? memes
    : memes.filter(m => m.subreddit === filter);

  const subreddits = [...new Set(memes.map(m => m.subreddit))];

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-800">Loading...</div>
      </div>
    );
  }

  if (!session?.user?.isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-800">You need administrator privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Reddit Memes Library</h1>
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {collecting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Collecting...
              </>
            ) : (
              "Collect Memes"
            )}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-2xl font-bold text-blue-600">{stats.reserved}</div>
            <div className="text-sm text-gray-600">Reserved</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-2xl font-bold text-green-600">{stats.used}</div>
            <div className="text-sm text-gray-600">Used</div>
          </div>
        </div>

        {/* Last result */}
        {lastResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-800">
              Collected {lastResult.fetched} memes, {lastResult.inserted} new added
            </p>
          </div>
        )}

        {/* Filter */}
        <div className="mb-4 flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-full text-sm ${
              filter === "all" ? "bg-orange-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            All ({memes.length})
          </button>
          {subreddits.map(sub => (
            <button
              key={sub}
              onClick={() => setFilter(sub)}
              className={`px-3 py-1 rounded-full text-sm ${
                filter === sub ? "bg-orange-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              r/{sub} ({memes.filter(m => m.subreddit === sub).length})
            </button>
          ))}
        </div>

        {/* Memes Grid */}
        {loading ? (
          <div className="text-center py-10">
            <div className="text-gray-600">Loading memes...</div>
          </div>
        ) : filteredMemes.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-gray-600">No memes found. Click "Collect Memes" to fetch from Reddit.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredMemes.map(meme => (
              <div
                key={meme._id}
                className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Image */}
                <div className="aspect-square relative">
                  <img
                    src={meme.editedImageUrl || meme.imageUrl}
                    alt={meme.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://via.placeholder.com/300?text=Image+Error";
                    }}
                  />
                  {/* Overlay with score */}
                  <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                    r/{meme.subreddit}
                  </div>
                  <div className="absolute top-2 right-2 bg-orange-600/90 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                    {meme.score}
                  </div>
                </div>

                {/* Content */}
                <div className="p-3">
                  <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">
                    {meme.editedTitle || meme.title}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>u/{meme.author}</span>
                    <span>{meme.numComments} comments</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <a
                      href={meme.redditUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Reddit
                    </a>
                    <button
                      onClick={() => handleDelete(meme._id)}
                      className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
