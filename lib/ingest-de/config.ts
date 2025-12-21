export interface JokeAPIIngestConfig {
  enabled: boolean;
  endpoint?: string;
  categories?: string[];
  blacklistFlags?: string[];
  timeoutMs?: number;
}

export interface AberwitzigIngestConfig {
  enabled: boolean;
  sources: Array<{
    category: string;
    part?: number;
    baseUrl?: string;
    timeoutMs?: number;
  }>;
}

export interface IngestConfigDE {
  jokeapi: JokeAPIIngestConfig;
  aberwitzig: AberwitzigIngestConfig;
}

export const getDefaultIngestConfigDE = (): IngestConfigDE => ({
  jokeapi: {
    enabled: true,
    categories: ["Any"], // Programming, Misc, Dark, Pun, Spooky, Christmas, Any
    blacklistFlags: ["nsfw", "racist", "sexist", "explicit"], // Filter out inappropriate content
    timeoutMs: 8000,
  },
  aberwitzig: {
    enabled: true,
    sources: [
      { category: "flachwitze", part: 1 },
      { category: "schwarzer-humor", part: 1 },
      { category: "chuck-norris-witze", part: 1 },
      { category: "deine-mutter-witze", part: 1 },
      { category: "witze", part: 1 },
      { category: "schlechte-witze", part: 1 },
      { category: "antiwitze", part: 1 },
      { category: "kinderwitze", part: 1 },
    ],
  },
});
