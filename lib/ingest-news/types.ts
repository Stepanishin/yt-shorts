export type NewsSource = "diezminutos" | "hola" | "caras" | "flash" | "noticiasaominuto" | "googlenews";

export interface NewsCandidate {
  source: NewsSource;
  title: string;
  summary: string; // Brief description (~150 characters)
  imageUrl: string; // URL of celebrity photo
  url: string; // Link to original news article
  externalId?: string; // Article ID from source
  slug?: string; // SEO-friendly URL slug
  category?: string; // "Famosos" or subcategory
  publishedDate?: Date; // Publication date
  author?: string; // Article author
  language: string; // "es" for Spanish
  meta?: Record<string, unknown>; // Additional data
}

export interface NewsPreviewRequest {
  diezminutos?: {
    enabled?: boolean;
    baseUrl?: string;
    category?: string; // Default: "famosos"
    maxPages?: number;
    timeoutMs?: number;
  };
  hola?: {
    enabled?: boolean;
    feedUrl?: string;
    timeoutMs?: number;
  };
}

export interface NewsPreviewBundle {
  news: NewsCandidate[];
  meta: Record<string, unknown>;
}
