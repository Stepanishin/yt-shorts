export interface BlagueDroleIngestConfig {
  enabled: boolean;
  sources: Array<{
    category?: string;
    page?: number;
    baseUrl?: string;
    timeoutMs?: number;
  }>;
}

export interface BlaguesEnStockIngestConfig {
  enabled: boolean;
  sources: Array<{
    category: string;
    baseUrl?: string;
    timeoutMs?: number;
  }>;
}

export interface BlagueHumourIngestConfig {
  enabled: boolean;
  sources: Array<{
    category?: string;
    page?: number;
    baseUrl?: string;
    timeoutMs?: number;
  }>;
}

export interface IngestConfigFR {
  blagueDrole: BlagueDroleIngestConfig;
  blaguesEnStock: BlaguesEnStockIngestConfig;
  blagueHumour: BlagueHumourIngestConfig;
}

export const getDefaultIngestConfigFR = (): IngestConfigFR => ({
  blagueDrole: {
    enabled: true,
    sources: [
      {}, // Main page with latest jokes - page will be tracked in DB
      { category: "histoire-drole" }, // Funny stories - working well
    ],
  },
  blaguesEnStock: {
    enabled: false, // Disabled by default, can be enabled as backup
    sources: [
      { category: "blagues-courtes.html" },
      { category: "blagues-animaux.html" },
      { category: "blagues-travail.html" },
      { category: "blagues-couple.html" },
      { category: "blagues-enfants.html" },
    ],
  },
  blagueHumour: {
    enabled: true,
    sources: [
      {}, // Main page - page will be tracked in DB
      { category: "blague-toto" }, // Toto jokes (very popular)
      { category: "blague-courtes-droles" }, // Short funny jokes
      { category: "blagues-beaufs" }, // Redneck jokes
      { category: "blagues-chuck-norris" }, // Chuck Norris jokes
      { category: "blagues-de-papa" }, // Dad jokes
      { category: "blagues-travail" }, // Work jokes
    ],
  },
});
