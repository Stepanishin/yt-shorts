export type JokeSourceDE = "jokeapi" | "aberwitzig";

export interface JokeCandidateDE {
  source: JokeSourceDE;
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

export interface JokePreviewRequestDE {
  jokeapi?: {
    enabled?: boolean;
    endpoint?: string;
    categories?: string[];
    blacklistFlags?: string[];
    timeoutMs?: number;
  };
  aberwitzig?: {
    enabled?: boolean;
    category: string;
    part?: number;
    baseUrl?: string;
    timeoutMs?: number;
  };
}

export interface JokePreviewBundleDE {
  jokes: JokeCandidateDE[];
  meta: Record<string, unknown>;
}
