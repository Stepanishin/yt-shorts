"use client";

import { useSearchParams } from "next/navigation";
import VideoConstructor from "../components/VideoConstructor";

export default function VideoConstructorPage() {
  const searchParams = useSearchParams();
  const jokeId = searchParams.get("jokeId");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Video Constructor</h1>
          <p className="text-sm text-gray-600 mt-1">
            {jokeId
              ? "Editing joke in video constructor"
              : "Create custom videos by adding text, emojis, and backgrounds"}
          </p>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <VideoConstructor jokeId={jokeId || undefined} />
      </main>
    </div>
  );
}
