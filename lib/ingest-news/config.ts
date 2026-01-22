import { NewsSource } from "./types";

export interface DiezMinutosIngestConfig {
  source: "diezminutos";
  enabled: boolean;
  baseUrl: string;
  category: string;
  timeoutMs: number;
  maxAgeDays: number; // Only fetch news from last N days
}

export const DEFAULT_DIEZMINUTOS_CONFIG: DiezMinutosIngestConfig = {
  source: "diezminutos",
  enabled: false, // Disabled - replaced by Hola.com
  baseUrl: "https://www.diezminutos.es",
  category: "famosos",
  timeoutMs: 15000,
  maxAgeDays: 3,
};

export interface HolaIngestConfig {
  source: "hola";
  enabled: boolean;
  feedUrls: string[]; // Multiple RSS feed URLs for different categories
  timeoutMs: number;
  maxAgeDays: number; // Only fetch news from last N days
}

const HOLA_API_KEY = "8dc5addf-5a55-4650-84f7-e18489a4cf5d";

export const DEFAULT_HOLA_CONFIG: HolaIngestConfig = {
  source: "hola",
  enabled: true,
  feedUrls: [
    // Famosos (celebrities) - main category
    `https://www.hola.com/feeds/google/es/famosos/any/30.xml?key=${HOLA_API_KEY}`,
    // Actualidad (current events/news)
    `https://www.hola.com/feeds/google/es/actualidad/any/30.xml?key=${HOLA_API_KEY}`,
    // Casas Reales (royal houses)
    `https://www.hola.com/feeds/google/es/realeza/any/20.xml?key=${HOLA_API_KEY}`,
  ],
  timeoutMs: 15000,
  maxAgeDays: 3,
};

export interface NewsIngestConfig {
  diezminutos: DiezMinutosIngestConfig;
  hola: HolaIngestConfig;
}

export const DEFAULT_NEWS_INGEST_CONFIG: NewsIngestConfig = {
  diezminutos: DEFAULT_DIEZMINUTOS_CONFIG,
  hola: DEFAULT_HOLA_CONFIG,
};
