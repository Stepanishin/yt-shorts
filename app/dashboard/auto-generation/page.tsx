"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface PublishTime {
  id: string;
  hour: number;
  minute: number;
  isEnabled: boolean;
}

interface AutoGenConfig {
  _id?: string;
  isEnabled: boolean;
  videosPerDay: number;
  publishTimes: PublishTime[];
  template: {
    text: {
      fontSize: number;
      color: string;
      backgroundColor: string;
      boxPadding: number;
      fontWeight: "normal" | "bold";
      position: { x: number; y: number };
      width: number;
    };
    gif: {
      urls: string[];
      position: string;
      width: number;
      height: number;
    };
    audio: {
      urls: string[];
      randomTrim: boolean;
      duration: number;
    };
    background: {
      unsplashKeywords: string[];
      imageEffect: string;
      fallbackImageUrl?: string;
    };
  };
  youtube: {
    privacyStatus: "public" | "private" | "unlisted";
    tags: string[];
    titleTemplate?: string;
    descriptionTemplate?: string;
    useAI: boolean;
  };
  stats?: {
    totalGenerated: number;
    totalPublished: number;
    lastGeneratedAt?: string;
    lastPublishedAt?: string;
  };
}

export default function AutoGenerationPage() {
  const { status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [config, setConfig] = useState<AutoGenConfig | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    } else if (status === "authenticated") {
      loadConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router]);

  const loadConfig = async () => {
    try {
      const response = await fetch("/api/auto-generation/config");
      const data = await response.json();

      if (data.success && data.config) {
        setConfig(data.config);
      } else {
        // Initialize with default config
        setConfig({
          isEnabled: false,
          videosPerDay: 3,
          publishTimes: [
            { id: "1", hour: 10, minute: 0, isEnabled: true },
            { id: "2", hour: 14, minute: 0, isEnabled: true },
            { id: "3", hour: 18, minute: 0, isEnabled: true },
          ],
          template: {
            text: {
              fontSize: 48,
              color: "black@1",
              backgroundColor: "white@0.6",
              boxPadding: 20,
              fontWeight: "bold",
              position: { x: 360, y: 400 },
              width: 600,
            },
            gif: {
              urls: [],
              position: "bottom-right",
              width: 150,
              height: 150,
            },
            audio: {
              urls: [],
              randomTrim: true,
              duration: 5,
            },
            background: {
              unsplashKeywords: ["funny", "humor", "comedy"],
              imageEffect: "zoom-in-out",
            },
          },
          youtube: {
            privacyStatus: "public",
            tags: ["shorts", "funny", "humor"],
            useAI: false,
          },
        });
      }
    } catch (error) {
      console.error("Error loading config:", error);
      showMessage("error", "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auto-generation/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
        showMessage("success", "Configuration saved successfully!");
      } else {
        showMessage("error", data.error || "Failed to save configuration");
      }
    } catch (error) {
      console.error("Error saving config:", error);
      showMessage("error", "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    // Validation before test
    if (!config?.isEnabled) {
      showMessage("error", "Please enable auto-generation first (toggle ON) and save!");
      return;
    }

    if (!config?.publishTimes || config.publishTimes.length === 0) {
      showMessage("error", "Please add at least one publish time!");
      return;
    }

    const enabledTimes = config.publishTimes.filter(t => t.isEnabled);
    if (enabledTimes.length === 0) {
      showMessage("error", "Please enable at least one publish time!");
      return;
    }

    setTesting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auto-generation/generate-now", {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showMessage("success", "Test video generation started! Check Scheduled Videos page.");
      } else {
        // Show actual error message from server
        showMessage("error", data.message || data.error || `Failed: ${response.status}`);
      }
    } catch (error) {
      console.error("Error testing generation:", error);
      showMessage("error", "Network error. Check console for details.");
    } finally {
      setTesting(false);
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleResetJokes = async () => {
    if (!confirm("Reset all 'used' and 'reserved' jokes back to 'pending'? This is for testing.")) {
      return;
    }

    setResetting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/debug/reset-jokes-status", {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showMessage(
          "success",
          `Reset ${data.stats.resetCount} jokes back to 'pending'!`
        );
      } else {
        showMessage("error", data.message || data.error || "Failed to reset");
      }
    } catch (error) {
      console.error("Error resetting jokes:", error);
      showMessage("error", "Failed to reset jokes");
    } finally {
      setResetting(false);
    }
  };

  const updateTimeSlot = (index: number, field: "hour" | "minute" | "isEnabled", value: number | boolean) => {
    if (!config) return;

    const newTimes = [...config.publishTimes];
    newTimes[index] = { ...newTimes[index], [field]: value };
    setConfig({ ...config, publishTimes: newTimes });
  };

  const addTimeSlot = () => {
    if (!config || config.publishTimes.length >= 6) return;

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

  const removeTimeSlot = (index: number) => {
    if (!config) return;

    const newTimes = config.publishTimes.filter((_, i) => i !== index);
    setConfig({ ...config, publishTimes: newTimes });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-800">Loading...</p>
        </div>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Auto Generation</h1>
              <p className="text-gray-600 mt-1">
                Automatically generate and schedule videos from jokes
              </p>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.isEnabled}
                  onChange={(e) => setConfig({ ...config, isEnabled: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  {config.isEnabled ? "Enabled" : "Disabled"}
                </span>
              </label>

              {config.isEnabled && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <span className="w-2 h-2 bg-green-600 rounded-full mr-2 animate-pulse"></span>
                  Active
                </span>
              )}
            </div>
          </div>

          {message && (
            <div
              className={`mb-4 p-4 rounded-lg ${
                message.type === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          {config.stats && (
            <div className="grid grid-cols-2 gap-4 mb-6 pb-6 border-b border-gray-200">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">Total Generated</p>
                <p className="text-2xl font-bold text-blue-900">{config.stats.totalGenerated}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-600 font-medium">Total Published</p>
                <p className="text-2xl font-bold text-green-900">{config.stats.totalPublished}</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Videos per day */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Videos Per Day
              </label>
              <input
                type="number"
                min="1"
                max="6"
                value={config.videosPerDay}
                onChange={(e) =>
                  setConfig({ ...config, videosPerDay: parseInt(e.target.value) || 1 })
                }
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Publish times */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Publish Times
                </label>
                <button
                  onClick={addTimeSlot}
                  disabled={config.publishTimes.length >= 6}
                  className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                >
                  + Add Time
                </button>
              </div>

              <div className="space-y-2">
                {config.publishTimes.map((time, index) => (
                  <div key={time.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={time.isEnabled}
                      onChange={(e) => updateTimeSlot(index, "isEnabled", e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={time.hour}
                      onChange={(e) => updateTimeSlot(index, "hour", parseInt(e.target.value) || 0)}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <span className="text-gray-500">:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={time.minute}
                      onChange={(e) => updateTimeSlot(index, "minute", parseInt(e.target.value) || 0)}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <button
                      onClick={() => removeTimeSlot(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* GIF URLs */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                GIF URLs (one per line)
              </label>
              <textarea
                value={config.template.gif.urls.join("\n")}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    template: {
                      ...config.template,
                      gif: {
                        ...config.template.gif,
                        urls: e.target.value.split("\n").filter((url) => url.trim()),
                      },
                    },
                  })
                }
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com/gif1.gif&#10;https://example.com/gif2.gif"
              />
            </div>

            {/* Audio URLs */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Audio URLs (one per line)
              </label>
              <textarea
                value={config.template.audio.urls.join("\n")}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    template: {
                      ...config.template,
                      audio: {
                        ...config.template.audio,
                        urls: e.target.value.split("\n").filter((url) => url.trim()),
                      },
                    },
                  })
                }
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com/audio1.mp3&#10;https://example.com/audio2.mp3"
              />
            </div>

            {/* Unsplash Keywords */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unsplash Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={config.template.background.unsplashKeywords.join(", ")}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    template: {
                      ...config.template,
                      background: {
                        ...config.template.background,
                        unsplashKeywords: e.target.value
                          .split(",")
                          .map((k) => k.trim())
                          .filter((k) => k),
                      },
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="funny, humor, comedy"
              />
            </div>

            {/* YouTube Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                YouTube Tags (comma-separated)
              </label>
              <input
                type="text"
                value={config.youtube.tags.join(", ")}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    youtube: {
                      ...config.youtube,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter((t) => t),
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="shorts, funny, humor"
              />
            </div>

            {/* Privacy Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Privacy Status
              </label>
              <select
                value={config.youtube.privacyStatus}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    youtube: {
                      ...config.youtube,
                      privacyStatus: e.target.value as "public" | "private" | "unlisted",
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>

            <button
              onClick={handleTest}
              disabled={testing || !config.isEnabled}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors font-medium"
            >
              {testing ? "Testing..." : "Test Generate"}
            </button>

            <button
              onClick={handleResetJokes}
              disabled={resetting}
              className="px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-400 transition-colors font-medium hidden"
              title="Reset all jokes back to 'pending' status for testing"
            >
              {resetting ? "Resetting..." : "Reset Jokes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
