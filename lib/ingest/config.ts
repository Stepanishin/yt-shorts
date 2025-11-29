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
      { slug: "buenos", page: 1 },
      { slug: "graciosos", page: 1 },
      { slug: "borrachos", page: 1 },
      { slug: "gallegos", page: 1 },
      { slug: "politicos", page: 1 },
    ],
  },
  todochistes: {
    enabled: true,
    sources: [
      { categorySlug: "hombres", perPage: 10 },
      { categorySlug: "padre", perPage: 10 },
      { categorySlug: "madre", perPage: 10 },
      { categorySlug: "viejecitos", perPage: 10 },
      { categorySlug: "pepito", perPage: 10 },
      { categorySlug: "jaimito", perPage: 10 },
      { categorySlug: "doctores", perPage: 10 },
      { categorySlug: "amigos", perPage: 10 },
      { categorySlug: "trabajos", perPage: 10 },
      { categorySlug: "borrachos", perPage: 10 },
    ],
  },
});

