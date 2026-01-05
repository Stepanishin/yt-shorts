"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import Image from "next/image";
import CreditsBalance from "@/app/components/CreditsBalance";

interface YouTubeSettingsForm {
  clientId: string;
  clientSecret: string;
  defaultPrivacyStatus: "public" | "private" | "unlisted";
  defaultTags: string;
  youtubeProject: 1 | 2;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [showYouTubeForm, setShowYouTubeForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [youtubeSettings, setYoutubeSettings] = useState<YouTubeSettingsForm>({
    clientId: "",
    clientSecret: "",
    defaultPrivacyStatus: "unlisted",
    defaultTags: "",
    youtubeProject: 1,
  });

  useEffect(() => {
    loadYouTubeSettings();
  }, []);

  const loadYouTubeSettings = async () => {
    try {
      const response = await fetch("/api/user/youtube-settings");
      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setYoutubeSettings({
            clientId: data.settings.clientId || "",
            clientSecret: "", // Don't load encrypted secret
            defaultPrivacyStatus: data.settings.defaultPrivacyStatus || "unlisted",
            defaultTags: data.settings.defaultTags?.join(", ") || "",
            youtubeProject: data.settings.youtubeProject || 1,
          });
          setYoutubeConnected(!!data.settings.accessToken);
        }
      }
    } catch (error) {
      console.error("Failed to load YouTube settings:", error);
    }
  };

  const handleSaveYouTubeSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/user/youtube-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: youtubeSettings.clientId,
          clientSecret: youtubeSettings.clientSecret,
          defaultPrivacyStatus: youtubeSettings.defaultPrivacyStatus,
          defaultTags: youtubeSettings.defaultTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          youtubeProject: youtubeSettings.youtubeProject,
        }),
      });

      if (response.ok) {
        setMessage({ type: "success", text: "YouTube settings saved successfully!" });
        setShowYouTubeForm(false);
        await loadYouTubeSettings();
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "Failed to save settings" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "An error occurred while saving settings" });
    } finally {
      setSaving(false);
    }
  };

  const handleConnectYouTube = () => {
    // Если у пользователя нет своих credentials, можно использовать глобальные (если они настроены)
    // Проверка наличия credentials происходит на сервере
    const authWindow = window.open("/api/youtube/auth", "_blank", "width=600,height=700");

    const checkAuthInterval = setInterval(() => {
      if (authWindow?.closed) {
        clearInterval(checkAuthInterval);
        setTimeout(() => {
          checkYouTubeConnection();
        }, 500);
      }
    }, 1000);
  };

  const checkYouTubeConnection = async () => {
    try {
      const response = await fetch("/api/youtube/check-auth");
      if (response.ok) {
        const data = await response.json();
        setYoutubeConnected(data.hasAccessToken || false);
      }
    } catch (error) {
      console.error("Failed to check YouTube auth:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 border border-green-300 text-green-900"
                : "bg-red-50 border border-red-300 text-red-900"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Profile Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            {session?.user?.image && (
              <Image
                src={session.user.image}
                alt={session.user.name || "User"}
                width={80}
                height={80}
                className="rounded-full"
              />
            )}
            <div>
              <p className="text-lg font-medium text-gray-900">
                {session?.user?.name}
              </p>
              <p className="text-sm text-gray-800">{session?.user?.email}</p>
            </div>
          </div>
        </div>

        {/* Credits Balance Section */}
        <div className="mb-6">
          <CreditsBalance />
        </div>

        {/* Integrations Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Integrations
          </h2>

          {/* YouTube Integration */}
          <div className="border border-gray-300 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                <div>
                  <h3 className="font-semibold text-gray-900">YouTube</h3>
                  <p className="text-sm text-gray-800">
                    Connect your YouTube channel to upload videos directly
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {youtubeConnected && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-300 rounded-md">
                    <svg
                      className="w-5 h-5 text-green-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm font-medium text-green-900">
                      Connected
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setShowYouTubeForm(!showYouTubeForm)}
                  className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition-colors font-medium text-sm"
                >
                  {showYouTubeForm ? "Hide Settings" : "Settings"}
                </button>
                <button
                  onClick={handleConnectYouTube}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium text-sm"
                >
                  {youtubeConnected ? "Reconnect" : "Connect"}
                </button>
              </div>
            </div>

            {/* YouTube Project Selector (Always Visible) */}
            <div className="mt-4 p-4 bg-amber-50 border border-amber-300 rounded-md">
              <label className="block text-sm font-medium text-gray-900 mb-2">
                YouTube API Project
              </label>
              <p className="text-xs text-gray-800 mb-3">
                Select which Google Cloud project to use for YouTube API quota. Each project has 10,000 units/day.
              </p>
              <div className="space-y-2 mb-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="youtubeProject"
                    value={1}
                    checked={youtubeSettings.youtubeProject === 1}
                    onChange={() =>
                      setYoutubeSettings({ ...youtubeSettings, youtubeProject: 1 })
                    }
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-900">
                    <strong>Project 1</strong> (Default - uses YOUTUBE_CLIENT_ID)
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="youtubeProject"
                    value={2}
                    checked={youtubeSettings.youtubeProject === 2}
                    onChange={() =>
                      setYoutubeSettings({ ...youtubeSettings, youtubeProject: 2 })
                    }
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-900">
                    <strong>Project 2</strong> (Additional quota - uses YOUTUBE_PROJECT_2_CLIENT_ID)
                  </span>
                </label>
              </div>
              <button
                onClick={async () => {
                  setSaving(true);
                  setMessage(null);
                  try {
                    const response = await fetch("/api/user/youtube-settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        youtubeProject: youtubeSettings.youtubeProject,
                      }),
                    });
                    if (response.ok) {
                      setMessage({ type: "success", text: "Project changed successfully!" });
                    } else {
                      const data = await response.json();
                      setMessage({ type: "error", text: data.error || "Failed to change project" });
                    }
                  } catch (error) {
                    setMessage({ type: "error", text: "An error occurred" });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Project"}
              </button>
            </div>

            {/* YouTube OAuth Configuration Form */}
            {showYouTubeForm && (
              <form onSubmit={handleSaveYouTubeSettings} className="mt-4 pt-4 border-t border-gray-300">
                <div className="mb-4 p-3 bg-blue-50 border border-blue-300 rounded-md">
                  <p className="text-sm text-blue-900">
                    <strong>Опционально:</strong> Вы можете настроить свои собственные YouTube OAuth credentials, 
                    или использовать глобальные настройки (если они настроены администратором). 
                    Если вы не заполните эти поля, будут использоваться глобальные настройки.
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      Google Cloud Client ID <span className="text-gray-700 font-normal">(опционально)</span>
                    </label>
                    <input
                      type="text"
                      value={youtubeSettings.clientId}
                      onChange={(e) =>
                        setYoutubeSettings({ ...youtubeSettings, clientId: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="123456789.apps.googleusercontent.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      Google Cloud Client Secret
                    </label>
                    <input
                      type="password"
                      value={youtubeSettings.clientSecret}
                      onChange={(e) =>
                        setYoutubeSettings({ ...youtubeSettings, clientSecret: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your client secret"
                    />
                    <p className="text-xs text-gray-700 mt-1">
                      Leave empty to keep existing secret
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 border border-gray-300 rounded-md">
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      Redirect URI (автоматически)
                    </label>
                    <code className="text-xs text-gray-800 block">
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/youtube/callback` : '/api/youtube/callback'}
                    </code>
                    <p className="text-xs text-gray-700 mt-1">
                      Используйте этот URL при создании OAuth credentials в Google Cloud Console
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      Default Privacy Status
                    </label>
                    <select
                      value={youtubeSettings.defaultPrivacyStatus}
                      onChange={(e) =>
                        setYoutubeSettings({
                          ...youtubeSettings,
                          defaultPrivacyStatus: e.target.value as "public" | "private" | "unlisted",
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      Default Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={youtubeSettings.defaultTags}
                      onChange={(e) =>
                        setYoutubeSettings({ ...youtubeSettings, defaultTags: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="shorts, funny, viral"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Settings"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowYouTubeForm(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors font-medium text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-blue-50 border border-blue-300 rounded-md text-xs text-blue-900">
                  <p className="font-medium mb-1">How to get your OAuth credentials:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Go to Google Cloud Console</li>
                    <li>Create or select a project</li>
                    <li>Enable YouTube Data API v3</li>
                    <li>Create OAuth 2.0 credentials</li>
                    <li>Add authorized redirect URI</li>
                  </ol>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
