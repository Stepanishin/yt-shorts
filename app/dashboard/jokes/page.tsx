"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import JokeList from "../../components/JokeList";

export default function JokesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    // Если пользователь не админ, редиректим на главную страницу dashboard
    if (!session?.user?.isAdmin) {
      router.push("/dashboard");
    }
  }, [session, status, router]);

  // Показываем загрузку пока проверяем права
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-800">Загрузка...</div>
      </div>
    );
  }

  // Если не админ, показываем сообщение (на случай если редирект не сработал мгновенно)
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Jokes Library</h1>
        <JokeList />
      </div>
    </div>
  );
}
