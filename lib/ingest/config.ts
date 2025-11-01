export interface ChistesIngestConfig {
  enabled: boolean;
  endpoint?: string;
  timeoutMs?: number;
}

export interface YavendrasIngestConfig {
  enabled: boolean;
  sources: Array<{
    slug: string;
    page?: number;
    baseUrl?: string;
    timeoutMs?: number;
  }>;
}

export interface TodoChistesIngestConfig {
  enabled: boolean;
  sources: Array<{
    categoryId?: number;
    categorySlug?: string;
    page?: number;
    perPage?: number;
    baseUrl?: string;
    timeoutMs?: number;
  }>;
}

export interface IngestConfig {
  chistes: ChistesIngestConfig;
  yavendras: YavendrasIngestConfig;
  todochistes: TodoChistesIngestConfig;
}

export const getDefaultIngestConfig = (): IngestConfig => ({
  chistes: {
    enabled: true,
    endpoint: process.env.CHISTES_API_ENDPOINT,
    timeoutMs: process.env.CHISTES_API_TIMEOUT_MS
      ? Number(process.env.CHISTES_API_TIMEOUT_MS)
      : undefined,
  },
  yavendras: {
    enabled: true,
    sources: [
      { slug: "chistes", page: 1 },
      { slug: "pepito", page: 1 },
      { slug: "chistescortos", page: 1 },
    ],
  },
  todochistes: {
    enabled: true,
    sources: [
      { categorySlug: "abogados", perPage: 5 },
      { categorySlug: "animales", perPage: 5 },
    ],
  },
});

