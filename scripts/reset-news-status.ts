import "dotenv/config";
import { getNewsCandidateCollection } from "../lib/ingest-news/storage";

async function resetAllNewsStatus() {
  try {
    console.log("Resetting all news to pending status...");

    const collection = await getNewsCandidateCollection();

    // Update all news that are reserved, used, rejected to pending
    const result = await collection.updateMany(
      {
        status: { $in: ["reserved", "used", "rejected"] }
      },
      {
        $set: {
          status: "pending",
          reservedAt: undefined,
          usedAt: undefined,
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} news items to pending status`);
    console.log(`Matched ${result.matchedCount} documents`);

    // Count all pending news
    const pendingCount = await collection.countDocuments({
      status: { $in: ["pending", undefined] }
    });

    console.log(`Total pending news now: ${pendingCount}`);

    process.exit(0);
  } catch (error) {
    console.error("Failed to reset news status:", error);
    process.exit(1);
  }
}

resetAllNewsStatus();
