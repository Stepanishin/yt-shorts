import VideoConstructor from "../components/VideoConstructor";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Video Constructor</h1>
        <VideoConstructor />
      </div>
    </div>
  );
}
