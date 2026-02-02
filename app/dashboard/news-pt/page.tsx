"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import NewsListPT from "../../components/NewsListPT";

export default function NewsPagePT() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    // Redirect non-admin users to main dashboard
    if (!session?.user?.isAdmin) {
      router.push("/dashboard");
    }
  }, [session, status, router]);

  // Show loading while checking permissions
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-800">Loading...</div>
      </div>
    );
  }

  // Show access denied if not admin
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">📰 Portuguese Celebrity News Library</h1>
        <NewsListPT />
      </div>
    </div>
  );
}
