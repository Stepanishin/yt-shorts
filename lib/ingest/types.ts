export type JokeSource = "chistes" | "yavendras" | "todochistes" | "ricuib-1000chistes" | "ricuib-pintamania";

export interface JokeCandidate {
  source: JokeSource;
  title?: string;
  text: string;
  rawHtml?: string;
  externalId?: string;
  url?: string;
  category?: string;
  language: string;
  ratingPercent?: number;
  votesTotal?: number;
  votesPositive?: number;
  votesNegative?: number;
  meta?: Record<string, unknown>;
}

export interface JokePreviewRequest {
  chistes?: {
    enabled?: boolean;
    endpoint?: string;
    timeoutMs?: number;
  };
  yavendras?: {
    enabled?: boolean;
    slug: string;
    page?: number;
    baseUrl?: string;
    timeoutMs?: number;
  };
  todochistes?: {
    enabled?: boolean;
    categoryId?: number;
    categorySlug?: string;
    baseUrl?: string;
    page?: number;
    perPage?: number;
    timeoutMs?: number;
  };
}

export interface JokePreviewBundle {
  jokes: JokeCandidate[];
  meta: Record<string, unknown>;
}

