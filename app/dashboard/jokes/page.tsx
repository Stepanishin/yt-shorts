import JokeList from "../../components/JokeList";

export default function JokesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Jokes Library</h1>
        <JokeList />
      </div>
    </div>
  );
}
