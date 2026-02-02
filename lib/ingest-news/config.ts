import type { NewsSource } from "./types";

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

export interface CarasIngestConfig {
  source: "caras";
  enabled: boolean;
  feedUrls: string[]; // Multiple RSS feed URLs for different categories
  timeoutMs: number;
  maxAgeDays: number; // Only fetch news from last N days
}

export const DEFAULT_CARAS_CONFIG: CarasIngestConfig = {
  source: "caras",
  enabled: true, // Using CM Jornal (Correio da Manhã) RSS
  feedUrls: [
    // CM Jornal main RSS feed (includes celebrity news)
    "https://www.cmjornal.pt/rss",
  ],
  timeoutMs: 20000,
  maxAgeDays: 3,
};

export interface FlashIngestConfig {
  source: "flash";
  enabled: boolean;
  feedUrl: string; // RSS feed URL
  timeoutMs: number;
  maxAgeDays: number; // Only fetch news from last N days
}

export const DEFAULT_FLASH_CONFIG: FlashIngestConfig = {
  source: "flash",
  enabled: false, // Disabled - RSS feed not available
  feedUrl: "https://www.flash.pt/rss",
  timeoutMs: 20000,
  maxAgeDays: 3,
};

export interface NewsIngestConfig {
  diezminutos: DiezMinutosIngestConfig;
  hola: HolaIngestConfig;
}

export interface NoticiasAoMinutoIngestConfig {
  source: "noticiasaominuto";
  enabled: boolean;
  feedUrls: string[]; // Multiple RSS feed URLs
  timeoutMs: number;
  maxAgeDays: number;
}

export const DEFAULT_NOTICIAS_AO_MINUTO_CONFIG: NoticiasAoMinutoIngestConfig = {
  source: "noticiasaominuto",
  enabled: false, // Disabled - RSS feeds not working (404)
  feedUrls: [
    // Lifestyle feed - includes celebrity news
    "https://www.noticiasaominuto.com/lifestyle/rss",
    // Fama (fame/celebrity) feed
    "https://www.noticiasaominuto.com/fama/rss",
  ],
  timeoutMs: 20000,
  maxAgeDays: 3,
};

export interface GoogleNewsPTIngestConfig {
  source: "googlenews";
  enabled: boolean;
  feedUrls: string[]; // Google News RSS feed URLs for Portugal
  timeoutMs: number;
  maxAgeDays: number;
}

export const DEFAULT_GOOGLE_NEWS_PT_CONFIG: GoogleNewsPTIngestConfig = {
  source: "googlenews",
  enabled: false, // Disabled - RSS feeds don't include images
  feedUrls: [
    // Entertainment/Celebridades topic (Portuguese, Portugal region)
    "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtVnVHZ0pWVXlnQVAB?hl=pt&gl=PT&ceid=PT:pt",
    // Search for "celebridades" (celebrities)
    "https://news.google.com/rss/search?q=celebridades&hl=pt&gl=PT&ceid=PT:pt",
    // Search for "famosos" (famous people)
    "https://news.google.com/rss/search?q=famosos&hl=pt&gl=PT&ceid=PT:pt",
  ],
  timeoutMs: 15000,
  maxAgeDays: 3,
};

export interface NewsIngestConfigPT {
  caras: CarasIngestConfig;
  flash: FlashIngestConfig;
  noticiasaominuto: NoticiasAoMinutoIngestConfig;
  googlenews: GoogleNewsPTIngestConfig;
}

export const DEFAULT_NEWS_INGEST_CONFIG: NewsIngestConfig = {
  diezminutos: DEFAULT_DIEZMINUTOS_CONFIG,
  hola: DEFAULT_HOLA_CONFIG,
};

export const DEFAULT_NEWS_INGEST_CONFIG_PT: NewsIngestConfigPT = {
  caras: DEFAULT_CARAS_CONFIG,
  flash: DEFAULT_FLASH_CONFIG,
  noticiasaominuto: DEFAULT_NOTICIAS_AO_MINUTO_CONFIG,
  googlenews: DEFAULT_GOOGLE_NEWS_PT_CONFIG,
};
