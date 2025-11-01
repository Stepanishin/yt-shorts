import JokeList from "./components/JokeList";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Генератор YouTube Shorts
          </h1>
          <p className="text-gray-600">
            Автоматическая генерация видео с испанскими анекдотами
          </p>
        </div>
        <JokeList />
      </main>
    </div>
  );
}
