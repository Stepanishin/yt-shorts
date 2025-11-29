"use client";

import { useSearchParams } from "next/navigation";
import VideoConstructor from "../components/VideoConstructor";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const jokeId = searchParams.get("jokeId");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Video Constructor</h1>
        <VideoConstructor jokeId={jokeId || undefined} />
      </div>
    </div>
  );
}
