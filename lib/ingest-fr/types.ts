export type JokeSourceFR = "blague-drole" | "blagues-en-stock" | "blague-humour";

export interface JokeCandidateFR {
  source: JokeSourceFR;
  title?: string;
  text: string;
  rawHtml?: string;
  externalId?: string;
  url?: string;
  category?: string;
  language: string;
  author?: string;
  ratingPercent?: number;
  votesTotal?: number;
  votesPositive?: number;
  votesNegative?: number;
  meta?: Record<string, unknown>;
}

export interface JokePreviewRequestFR {
  blagueDrole?: {
    enabled?: boolean;
    category?: string;
    page?: number;
    baseUrl?: string;
    timeoutMs?: number;
  };
  blaguesEnStock?: {
    enabled?: boolean;
    category: string;
    baseUrl?: string;
    timeoutMs?: number;
  };
  blagueHumour?: {
    enabled?: boolean;
    category?: string;
    page?: number;
    baseUrl?: string;
    timeoutMs?: number;
  };
}

export interface JokePreviewBundleFR {
  jokes: JokeCandidateFR[];
  meta: Record<string, unknown>;
}
