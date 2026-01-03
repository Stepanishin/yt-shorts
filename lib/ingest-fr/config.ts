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
      { page: 1 }, // Main page with latest jokes
      { category: "histoire-drole", page: 1 }, // Funny stories - working well
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
      { page: 1 }, // Main page
      { category: "blague-toto", page: 1 }, // Toto jokes (very popular)
      { category: "blague-courtes-droles", page: 1 }, // Short funny jokes
      { category: "blagues-beaufs", page: 1 }, // Redneck jokes
      { category: "blagues-chuck-norris", page: 1 }, // Chuck Norris jokes
      { category: "blagues-de-papa", page: 1 }, // Dad jokes
      { category: "blagues-travail", page: 1 }, // Work jokes
    ],
  },
});
