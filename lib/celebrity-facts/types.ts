export interface CelebrityFact {
  title: string;
  imageHashtags: string[]; // e.g. ["#taylorswift", "#celebrity", "#music"]
  sourceLinks: string[]; // URLs to original sources
  text: string; // Main fact text
}

export interface StoredCelebrityFact extends CelebrityFact {
  _id?: unknown;
  createdAt: Date;
  status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
  reservedAt?: Date;
  usedAt?: Date;
  deletedAt?: Date;
  publishedAt?: Date;
  notes?: string;

  // YouTube metadata
  youtubeVideoUrl?: string;
  youtubeVideoId?: string;
}
