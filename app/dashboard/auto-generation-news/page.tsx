"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface YouTubeChannel {
  id: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
}

interface PublishTime {
  id: string;
  hour: number;
  minute: number;
  isEnabled: boolean;
}

interface NewsIngestSchedule {
  hour: number;
  minute: number;
  isEnabled: boolean;
}

interface NewsAutoGenConfig {
  _id?: string;
  isEnabled: boolean;
  videosPerDay: number;
  publishTimes: PublishTime[];
  newsIngestSchedule?: NewsIngestSchedule;
  selectedTemplate?: "template1" | "template2";
  template: {
    celebrityImage: {
      height: number;
      objectFit: "cover" | "contain";
      position: "top" | "center";
    };
    newsText: {
      title: {
        fontSize: number;
        color: string;
        fontWeight: "normal" | "bold";
        y: number;
        lineSpacing: number;
      };
      summary: {
        fontSize: number;
        color: string;
        fontWeight: "normal" | "bold";
        y: number;
        lineSpacing: number;
      };
      backgroundColor: string;
      width: number;
      padding: number;
    };
    audio?: {
      urls: string[];
      randomTrim: boolean;
      duration: number;
    };
  };
  youtube: {
    privacyStatus: "public" | "private" | "unlisted";
    tags: string[];
    titleTemplate?: string;
    descriptionTemplate?: string;
    useAI: boolean;
    channelId?: string;
    manualChannelId?: string;
    savedChannelId?: string;
  };
  stats?: {
    totalGenerated: number;
    totalPublished: number;
    lastGeneratedAt?: string;
    lastPublishedAt?: string;
  };
}

export default function AutoGenerationNewsPage() {
  const { status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<NewsAutoGenConfig | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [savedChannels, setSavedChannels] = useState<Array<{
    channelId: string;
    channelTitle: string;
    isDefault: boolean;
  }>>([]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    } else if (status === "authenticated") {
      loadConfig();
      loadChannels();
      loadSavedChannels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router]);

  const loadConfig = async () => {
    try {
      const response = await fetch("/api/auto-generation-news/config");
      const data = await response.json();

      if (data.success && data.config) {
        setConfig(data.config);
      } else {
        // Initialize with default config
        setConfig({
          isEnabled: false,
          videosPerDay: 6,
          publishTimes: [
            { id: "1", hour: 9, minute: 0, isEnabled: true },
            { id: "2", hour: 12, minute: 0, isEnabled: true },
            { id: "3", hour: 15, minute: 0, isEnabled: true },
            { id: "4", hour: 18, minute: 0, isEnabled: true },
            { id: "5", hour: 21, minute: 0, isEnabled: true },
            { id: "6", hour: 0, minute: 0, isEnabled: true },
          ],
          newsIngestSchedule: {
            hour: 6,
            minute: 0,
            isEnabled: true,
          },
          template: {
            celebrityImage: {
              height: 427,
              objectFit: "cover",
              position: "top",
            },
            newsText: {
              title: {
                fontSize: 52,
                color: "black@1",
                fontWeight: "bold",
                y: 470,
                lineSpacing: 18,
              },
              summary: {
                fontSize: 36,
                color: "black@1",
                fontWeight: "normal",
                y: 620,
                lineSpacing: 15,
              },
              backgroundColor: "white@1",
              width: 680,
              padding: 20,
            },
            audio: {
              urls: [],
              randomTrim: true,
              duration: 8,
            },
          },
          youtube: {
            privacyStatus: "public",
            tags: ["noticias", "famosos", "españa", "celebrities", "shorts"],
            useAI: true,
          },
        });
      }
    } catch (error) {
      console.error("Failed to load config:", error);
      setMessage({
        type: "error",
        text: "Failed to load configuration",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadChannels = async () => {
    setLoadingChannels(true);
    try {
      const response = await fetch("/api/youtube/channels");
      const data = await response.json();

      if (data.success && data.channels) {
        setChannels(data.channels);
      }
    } catch (error) {
      console.error("Error loading channels:", error);
    } finally {
      setLoadingChannels(false);
    }
  };

  const loadSavedChannels = async () => {
    try {
      const response = await fetch("/api/youtube/my-channels");
      if (response.ok) {
        const data = await response.json();
        setSavedChannels(data.channels || []);
      }
    } catch (error) {
      console.error("Error loading saved channels:", error);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auto-generation-news/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
        setMessage({
          type: "success",
          text: "Configuration saved successfully!",
        });
      } else {
        throw new Error(data.error || "Failed to save configuration");
      }
    } catch (error) {
      console.error("Failed to save config:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save configuration",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestGeneration = async () => {
    setTesting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auto-generation-news/generate-now", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          type: "success",
          text: `Test video generation started! Job ID: ${data.job.id}. Check the scheduled videos page.`,
        });
      } else {
        throw new Error(data.error || "Failed to start test generation");
      }
    } catch (error) {
      console.error("Failed to test generation:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to start test generation",
      });
    } finally {
      setTesting(false);
    }
  };

  const addPublishTime = () => {
    if (!config) return;

    const newTime: PublishTime = {
      id: Date.now().toString(),
      hour: 12,
      minute: 0,
      isEnabled: true,
    };

    setConfig({
      ...config,
      publishTimes: [...config.publishTimes, newTime],
    });
  };

  const removePublishTime = (id: string) => {
    if (!config) return;

    setConfig({
      ...config,
      publishTimes: config.publishTimes.filter(t => t.id !== id),
    });
  };

  const updatePublishTime = (id: string, updates: Partial<PublishTime>) => {
    if (!config) return;

    setConfig({
      ...config,
      publishTimes: config.publishTimes.map(t =>
        t.id === id ? { ...t, ...updates } : t
      ),
    });
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          📰 Celebrity News Auto-Generation
        </h1>
        <p className="text-gray-600 mb-8">
          Configure automatic video generation from celebrity news (DiezMinutos.es)
        </p>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 rounded-lg border p-4 ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Stats */}
        {config.stats && (
          <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Statistics</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-600">Total Generated</div>
                <div className="text-2xl font-bold text-gray-900">
                  {config.stats.totalGenerated || 0}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Total Published</div>
                <div className="text-2xl font-bold text-gray-900">
                  {config.stats.totalPublished || 0}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enable/Disable */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Activation</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.isEnabled}
              onChange={(e) => setConfig({ ...config, isEnabled: e.target.checked })}
              className="w-6 h-6 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-900 font-medium">
              Enable automatic news video generation
            </span>
          </label>
          {config.isEnabled && (
            <div className="mt-3 text-sm text-green-700 bg-green-50 rounded-md p-3">
              ✅ Auto-generation is active. Videos will be generated according to the schedule below.
            </div>
          )}
        </div>

        {/* Videos Per Day */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Videos Per Day</h2>
          <label className="block">
            <span className="text-sm text-gray-700 mb-2 block">
              Number of videos to generate per day (6-10 recommended)
            </span>
            <input
              type="number"
              min="1"
              max="20"
              value={config.videosPerDay}
              onChange={(e) => setConfig({ ...config, videosPerDay: parseInt(e.target.value) || 6 })}
              className="w-32 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>

        {/* Publish Times */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Publish Schedule</h2>
            <button
              onClick={addPublishTime}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              + Add Time Slot
            </button>
          </div>
          <div className="space-y-3">
            {config.publishTimes.map((time) => (
              <div key={time.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={time.isEnabled}
                  onChange={(e) => updatePublishTime(time.id, { isEnabled: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={time.hour}
                  onChange={(e) => updatePublishTime(time.id, { hour: parseInt(e.target.value) || 0 })}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
                <span>:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={time.minute}
                  onChange={(e) => updatePublishTime(time.id, { minute: parseInt(e.target.value) || 0 })}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => removePublishTime(time.id)}
                  className="ml-auto px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* News Ingest Schedule */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">News Scraping Schedule</h2>
              <p className="text-sm text-gray-500 mt-1">
                Automatically fetch new celebrity news once per day at the specified time
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="checkbox"
              checked={config.newsIngestSchedule?.isEnabled ?? true}
              onChange={(e) => setConfig({
                ...config,
                newsIngestSchedule: {
                  hour: config.newsIngestSchedule?.hour ?? 6,
                  minute: config.newsIngestSchedule?.minute ?? 0,
                  isEnabled: e.target.checked,
                }
              })}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Enable automatic news scraping</span>
          </div>
          {config.newsIngestSchedule?.isEnabled !== false && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-gray-700">Run daily at:</span>
              <input
                type="number"
                min="0"
                max="23"
                value={config.newsIngestSchedule?.hour ?? 6}
                onChange={(e) => setConfig({
                  ...config,
                  newsIngestSchedule: {
                    hour: parseInt(e.target.value) || 0,
                    minute: config.newsIngestSchedule?.minute ?? 0,
                    isEnabled: config.newsIngestSchedule?.isEnabled ?? true,
                  }
                })}
                className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
              <span>:</span>
              <input
                type="number"
                min="0"
                max="59"
                value={config.newsIngestSchedule?.minute ?? 0}
                onChange={(e) => setConfig({
                  ...config,
                  newsIngestSchedule: {
                    hour: config.newsIngestSchedule?.hour ?? 6,
                    minute: parseInt(e.target.value) || 0,
                    isEnabled: config.newsIngestSchedule?.isEnabled ?? true,
                  }
                })}
                className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">
                ({String(config.newsIngestSchedule?.hour ?? 6).padStart(2, '0')}:{String(config.newsIngestSchedule?.minute ?? 0).padStart(2, '0')})
              </span>
            </div>
          )}
        </div>

        {/* Template Selection */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Video Template</h2>
          <p className="text-sm text-gray-500 mb-4">Choose the visual style for generated news videos</p>
          <div className="grid grid-cols-2 gap-4">
            {/* Template 1 */}
            <label
              className={`cursor-pointer border-2 rounded-lg p-4 transition-colors ${
                (config.selectedTemplate || "template1") === "template1"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                value="template1"
                checked={(config.selectedTemplate || "template1") === "template1"}
                onChange={() => setConfig({ ...config, selectedTemplate: "template1" })}
                className="sr-only"
              />
              <div className="text-center">
                <div className="text-sm font-semibold text-gray-900 mb-3">Template 1 (Default)</div>
                {/* Mini preview */}
                <div className="mx-auto w-24 h-40 border border-gray-300 rounded overflow-hidden">
                  <div className="h-14 bg-gray-400 flex items-center justify-center">
                    <span className="text-white text-xs">📸 Photo</span>
                  </div>
                  <div className="mx-2 -mt-3 h-5 bg-gradient-to-r from-red-900 via-blue-900 to-blue-600 rounded flex items-center justify-center">
                    <span className="text-white" style={{ fontSize: "6px" }}>HEADLINE</span>
                  </div>
                  <div className="flex-1 bg-gradient-to-b from-blue-900 to-purple-900 p-1 mt-1">
                    <div className="text-white opacity-80" style={{ fontSize: "5px" }}>Sensationalized text over gradient background...</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Gradient bg · White text</p>
              </div>
            </label>

            {/* Template 2 */}
            <label
              className={`cursor-pointer border-2 rounded-lg p-4 transition-colors ${
                config.selectedTemplate === "template2"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                value="template2"
                checked={config.selectedTemplate === "template2"}
                onChange={() => setConfig({ ...config, selectedTemplate: "template2" })}
                className="sr-only"
              />
              <div className="text-center">
                <div className="text-sm font-semibold text-gray-900 mb-3">Template 2</div>
                {/* Mini preview */}
                <div className="mx-auto w-24 h-40 border border-gray-300 rounded overflow-hidden">
                  <div className="h-14 bg-gray-400 flex items-center justify-center">
                    <span className="text-white text-xs">📸 Photo</span>
                  </div>
                  <div className="mx-2 -mt-3 h-5 bg-red-600 rounded flex items-center justify-center">
                    <span className="text-white font-bold" style={{ fontSize: "6px", textShadow: "0 0 2px black" }}>HEADLINE</span>
                  </div>
                  <div className="bg-white p-1 mt-1 flex-1">
                    <div className="bg-yellow-400 rounded p-0.5">
                      <span className="text-black font-bold" style={{ fontSize: "5px" }}>Black bold text on yellow container...</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Red headline · Yellow text box</p>
              </div>
            </label>
          </div>
        </div>

        {/* YouTube Settings */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">YouTube Settings</h2>

          <div className="space-y-4">
            {/* Privacy Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Privacy Status
              </label>
              <select
                value={config.youtube.privacyStatus}
                onChange={(e) => setConfig({
                  ...config,
                  youtube: { ...config.youtube, privacyStatus: e.target.value as any }
                })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>

            {/* AI Title/Description */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.youtube.useAI}
                  onChange={(e) => setConfig({
                    ...config,
                    youtube: { ...config.youtube, useAI: e.target.checked }
                  })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-900">
                  Use AI to generate catchy titles and descriptions
                </span>
              </label>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={config.youtube.tags.join(", ")}
                onChange={(e) => setConfig({
                  ...config,
                  youtube: {
                    ...config.youtube,
                    tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean)
                  }
                })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="noticias, famosos, españa, celebrities"
              />
            </div>

            {/* YouTube Channel Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                YouTube Channel (Optional)
              </label>
              {loadingChannels ? (
                <div className="text-sm text-gray-500">Loading channels...</div>
              ) : channels.length > 0 ? (
                <select
                  value={config.youtube.channelId || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      youtube: {
                        ...config.youtube,
                        channelId: e.target.value || undefined,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Default channel</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.title} {channel.customUrl ? `(${channel.customUrl})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500">
                  No channels found. Connect YouTube in Settings first.
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Leave as &quot;Default channel&quot; if you have only one channel
              </p>
            </div>

            {/* Saved YouTube Channels Dropdown (Multi-Channel Support) */}
            {savedChannels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Saved Channel (Recommended)
                </label>
                <select
                  value={config.youtube.savedChannelId || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      youtube: {
                        ...config.youtube,
                        savedChannelId: e.target.value || undefined,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None (use default or manual)</option>
                  {savedChannels.map((channel) => (
                    <option key={channel.channelId} value={channel.channelId}>
                      {channel.channelTitle} {channel.isDefault ? "(Default)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select a channel from your saved channels. You can add more in Settings.
                </p>
              </div>
            )}

            {/* Manual Channel ID Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Manual Channel ID (Optional)
              </label>
              <input
                type="text"
                value={config.youtube.manualChannelId || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    youtube: {
                      ...config.youtube,
                      manualChannelId: e.target.value || undefined,
                    },
                  })
                }
                placeholder="UC..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                For Brand Accounts: Enter your channel ID manually (starts with UC)
              </p>
            </div>
          </div>
        </div>

        {/* Audio Settings */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Audio Settings (Optional)</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Background Music URLs (one per line)
              </label>
              <textarea
                value={config.template.audio?.urls.join("\n") || ""}
                onChange={(e) => setConfig({
                  ...config,
                  template: {
                    ...config.template,
                    audio: {
                      ...config.template.audio!,
                      urls: e.target.value.split("\n").map(u => u.trim()).filter(Boolean)
                    }
                  }
                })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                placeholder="https://example.com/music1.mp3&#10;https://example.com/music2.mp3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Video Duration (seconds)
              </label>
              <input
                type="number"
                min="5"
                max="60"
                value={config.template.audio?.duration || 8}
                onChange={(e) => setConfig({
                  ...config,
                  template: {
                    ...config.template,
                    audio: {
                      ...config.template.audio!,
                      duration: parseInt(e.target.value) || 8
                    }
                  }
                })}
                className="w-32 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-lg"
          >
            {saving ? "Saving..." : "💾 Save Configuration"}
          </button>

          <button
            onClick={handleTestGeneration}
            disabled={testing || !config.isEnabled}
            className="px-8 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-lg"
          >
            {testing ? "Generating..." : "🎬 Test Generation Now"}
          </button>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
          <strong>Note:</strong> The system will automatically scrape news from DiezMinutos.es daily at 08:00 UTC.
          Videos will be generated according to your schedule and published to YouTube.
        </div>
      </div>
    </div>
  );
}
