"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

interface PublishTime {
  id: string;
  hour: number;
  minute: number;
  isEnabled: boolean;
}

interface MemeConfig {
  _id?: string;
  userId: string;
  isEnabled: boolean;
  videosPerDay: number;
  publishTimes: PublishTime[];
  template: {
    imageEffect: "none" | "zoom-in" | "zoom-in-out" | "pan-right-left";
    duration: number;
    audio?: {
      urls: string[];
      randomTrim: boolean;
    };
    gif?: {
      urls: string[];
      width: number;
      height: number;
    };
  };
  youtube: {
    privacyStatus: "public" | "private" | "unlisted";
    tags: string[];
    useAI: boolean;
    channelId?: string;
    savedChannelId?: string;
  };
  stats: {
    totalGenerated: number;
    totalPublished: number;
    lastGeneratedAt?: string;
  };
}

interface Job {
  _id: string;
  status: string;
  memeTitle: string;
  memeImageUrl: string;
  createdAt: string;
  results?: {
    renderedVideoUrl?: string;
    scheduledAt?: string;
  };
  errorMessage?: string;
}

interface MemeStats {
  pending: number;
  reserved: number;
  used: number;
}

const DEFAULT_CONFIG: Omit<MemeConfig, "userId"> = {
  isEnabled: false,
  videosPerDay: 3,
  publishTimes: [
    { id: "1", hour: 10, minute: 0, isEnabled: true },
    { id: "2", hour: 14, minute: 0, isEnabled: true },
    { id: "3", hour: 20, minute: 0, isEnabled: true },
  ],
  template: {
    imageEffect: "zoom-in-out",
    duration: 10,
    audio: {
      urls: [],
      randomTrim: true,
    },
    gif: {
      urls: [],
      width: 150,
      height: 150,
    },
  },
  youtube: {
    privacyStatus: "public",
    tags: ["meme", "memes", "humor", "viral", "shorts", "funny"],
    useAI: true,
  },
  stats: {
    totalGenerated: 0,
    totalPublished: 0,
  },
};

export default function MemeAutoGenerationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [config, setConfig] = useState<MemeConfig | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [memeStats, setMemeStats] = useState<MemeStats>({ pending: 0, reserved: 0, used: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/auto-generation-memes/config");
      const data = await response.json();
      if (data.success && data.config) {
        setConfig(data.config);
      } else {
        setConfig({ ...DEFAULT_CONFIG, userId: session?.user?.id || "" } as MemeConfig);
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    }
  }, [session?.user?.id]);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/auto-generation-memes/queue?limit=10");
      const data = await response.json();
      if (data.success) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    }
  }, []);

  const fetchMemeStats = useCallback(async () => {
    try {
      const response = await fetch("/api/reddit-ingest/queue?limit=1");
      const data = await response.json();
      if (data.success) {
        setMemeStats(data.stats);
      }
    } catch (error) {
      console.error("Error fetching meme stats:", error);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/");
      return;
    }
    Promise.all([fetchConfig(), fetchJobs(), fetchMemeStats()]).finally(() => setLoading(false));
  }, [session, status, router, fetchConfig, fetchJobs, fetchMemeStats]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auto-generation-memes/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
        setMessage({ type: "success", text: "Configuration saved successfully!" });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save configuration" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save configuration" });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateNow = async () => {
    setGenerating(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auto-generation-memes/generate-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: `Video generated! Title: ${data.job.memeTitle}` });
        fetchJobs();
        fetchMemeStats();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to generate video" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to generate video" });
    } finally {
      setGenerating(false);
    }
  };

  const updatePublishTime = (id: string, field: keyof PublishTime, value: number | boolean) => {
    if (!config) return;
    setConfig({
      ...config,
      publishTimes: config.publishTimes.map((pt) =>
        pt.id === id ? { ...pt, [field]: value } : pt
      ),
    });
  };

  const addPublishTime = () => {
    if (!config) return;
    const newId = String(Date.now());
    setConfig({
      ...config,
      publishTimes: [
        ...config.publishTimes,
        { id: newId, hour: 12, minute: 0, isEnabled: true },
      ],
    });
  };

  const removePublishTime = (id: string) => {
    if (!config) return;
    setConfig({
      ...config,
      publishTimes: config.publishTimes.filter((pt) => pt.id !== id),
    });
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-800">Loading...</div>
      </div>
    );
  }

  if (!session || !config) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          🎭 Meme Auto-Generation
        </h1>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-2xl font-bold text-yellow-600">{memeStats.pending}</div>
            <div className="text-sm text-gray-600">Available Memes</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-2xl font-bold text-blue-600">{config.stats.totalGenerated}</div>
            <div className="text-sm text-gray-600">Generated</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-2xl font-bold text-green-600">{config.stats.totalPublished}</div>
            <div className="text-sm text-gray-600">Published</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-2xl font-bold text-purple-600">{config.videosPerDay}</div>
            <div className="text-sm text-gray-600">Videos/Day</div>
          </div>
        </div>

        {/* Main Settings */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Settings</h2>

          {/* Enable Toggle */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b">
            <div>
              <div className="font-medium text-gray-900">Enable Auto-Generation</div>
              <div className="text-sm text-gray-500">Automatically generate meme videos</div>
            </div>
            <button
              onClick={() => setConfig({ ...config, isEnabled: !config.isEnabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.isEnabled ? "bg-orange-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.isEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Videos Per Day */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Videos Per Day
            </label>
            <input
              type="number"
              min="1"
              max="5"
              value={config.videosPerDay}
              onChange={(e) =>
                setConfig({ ...config, videosPerDay: parseInt(e.target.value) || 1 })
              }
              className="w-32 px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Image Effect */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Video Effect (Ken Burns)
            </label>
            <select
              value={config.template.imageEffect}
              onChange={(e) =>
                setConfig({
                  ...config,
                  template: {
                    ...config.template,
                    imageEffect: e.target.value as MemeConfig["template"]["imageEffect"],
                  },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="zoom-in-out">Zoom In-Out (Breathing)</option>
              <option value="zoom-in">Zoom In</option>
              <option value="pan-right-left">Pan Right-Left</option>
              <option value="none">None (Static)</option>
            </select>
          </div>

          {/* Duration */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Video Duration (seconds)
            </label>
            <input
              type="number"
              min="5"
              max="15"
              value={config.template.duration}
              onChange={(e) =>
                setConfig({
                  ...config,
                  template: {
                    ...config.template,
                    duration: parseInt(e.target.value) || 10,
                  },
                })
              }
              className="w-32 px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Audio URLs */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Background Music URLs (one per line)
            </label>
            <textarea
              value={config.template.audio?.urls.join("\n") || ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  template: {
                    ...config.template,
                    audio: {
                      ...config.template.audio,
                      urls: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                      randomTrim: config.template.audio?.randomTrim ?? true,
                    },
                  },
                })
              }
              rows={4}
              placeholder="https://example.com/music1.mp3&#10;https://example.com/music2.mp3"
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>

          {/* GIF URLs */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              GIF URLs (one per line)
            </label>
            <textarea
              value={config.template.gif?.urls.join("\n") || ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  template: {
                    ...config.template,
                    gif: {
                      ...config.template.gif,
                      urls: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                      width: config.template.gif?.width ?? 150,
                      height: config.template.gif?.height ?? 150,
                    },
                  },
                })
              }
              rows={4}
              placeholder="https://example.com/gif1.gif&#10;https://example.com/gif2.gif"
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>

          {/* GIF Size */}
          <div className="flex gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                GIF Width (px)
              </label>
              <input
                type="number"
                min="50"
                max="400"
                value={config.template.gif?.width ?? 150}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    template: {
                      ...config.template,
                      gif: {
                        ...config.template.gif,
                        urls: config.template.gif?.urls ?? [],
                        width: parseInt(e.target.value) || 150,
                        height: config.template.gif?.height ?? 150,
                      },
                    },
                  })
                }
                className="w-32 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                GIF Height (px)
              </label>
              <input
                type="number"
                min="50"
                max="400"
                value={config.template.gif?.height ?? 150}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    template: {
                      ...config.template,
                      gif: {
                        ...config.template.gif,
                        urls: config.template.gif?.urls ?? [],
                        width: config.template.gif?.width ?? 150,
                        height: parseInt(e.target.value) || 150,
                      },
                    },
                  })
                }
                className="w-32 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              YouTube Tags (comma separated)
            </label>
            <input
              type="text"
              value={config.youtube.tags.join(", ")}
              onChange={(e) =>
                setConfig({
                  ...config,
                  youtube: {
                    ...config.youtube,
                    tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                  },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* AI Title Generation */}
          <div className="flex items-center mb-6">
            <input
              type="checkbox"
              id="useAI"
              checked={config.youtube.useAI}
              onChange={(e) =>
                setConfig({
                  ...config,
                  youtube: { ...config.youtube, useAI: e.target.checked },
                })
              }
              className="h-4 w-4 text-orange-600 rounded"
            />
            <label htmlFor="useAI" className="ml-2 text-sm text-gray-700">
              Generate Spanish titles and descriptions with AI
            </label>
          </div>
        </div>

        {/* Publish Times */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Publish Schedule</h2>

          <div className="space-y-3">
            {config.publishTimes.map((pt) => (
              <div key={pt.id} className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={pt.isEnabled}
                  onChange={(e) => updatePublishTime(pt.id, "isEnabled", e.target.checked)}
                  className="h-4 w-4 text-orange-600 rounded"
                />
                <select
                  value={pt.hour}
                  onChange={(e) => updatePublishTime(pt.id, "hour", parseInt(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i.toString().padStart(2, "0")}
                    </option>
                  ))}
                </select>
                <span>:</span>
                <select
                  value={pt.minute}
                  onChange={(e) => updatePublishTime(pt.id, "minute", parseInt(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                >
                  {[0, 15, 30, 45].map((m) => (
                    <option key={m} value={m}>
                      {m.toString().padStart(2, "0")}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removePublishTime(pt.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addPublishTime}
            className="mt-4 text-orange-600 hover:text-orange-800 text-sm font-medium"
          >
            + Add Time Slot
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
          <button
            onClick={handleGenerateNow}
            disabled={generating || memeStats.pending === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate Now"}
          </button>
        </div>

        {/* Recent Jobs */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Generation Jobs</h2>

          {jobs.length === 0 ? (
            <p className="text-gray-500">No jobs yet. Click "Generate Now" to create your first meme video.</p>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div
                  key={job._id}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg"
                >
                  {job.memeImageUrl && (
                    <img
                      src={job.memeImageUrl}
                      alt={job.memeTitle}
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{job.memeTitle || "Untitled"}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(job.createdAt).toLocaleString()}
                    </div>
                    {job.errorMessage && (
                      <div className="text-sm text-red-600">{job.errorMessage}</div>
                    )}
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      job.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : job.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {job.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
