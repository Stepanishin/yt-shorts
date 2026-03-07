import { getCelebrityFactCollection, StoredCelebrityFact } from "@/lib/celebrity-facts/storage";
import { ObjectId } from "mongodb";

/**
 * Reserve next celebrity fact for generation
 */
export async function selectNextCelebrityFact(): Promise<(StoredCelebrityFact & { _id: ObjectId }) | undefined> {
  const collection = await getCelebrityFactCollection();

  const result = await collection.findOneAndUpdate(
    { status: { $in: [undefined, "pending"] } },
    { $set: { status: "reserved", reservedAt: new Date() } },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );

  const fact = result?.value || (result as any) || result;
  if (!fact || !fact._id) {
    console.warn("No celebrity facts available");
    return undefined;
  }

  console.log(`Selected celebrity fact: ${fact._id} - "${fact.title}"`);
  return fact as StoredCelebrityFact & { _id: ObjectId };
}

/**
 * Get count of available celebrity facts
 */
export async function getAvailableCelebrityFactsCount(): Promise<number> {
  const collection = await getCelebrityFactCollection();
  return collection.countDocuments({ status: { $in: [undefined, "pending"] } });
}
