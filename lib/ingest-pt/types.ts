export type JokeSourcePT = "piadacom";

export interface JokeCandidatePT {
  source: JokeSourcePT;
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

export interface JokePreviewRequestPT {
  piadacom?: {
    enabled?: boolean;
    category: string;
    page?: number;
    baseUrl?: string;
    timeoutMs?: number;
  };
}

export interface JokePreviewBundlePT {
  jokes: JokeCandidatePT[];
  meta: Record<string, unknown>;
}
