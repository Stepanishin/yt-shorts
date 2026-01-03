import { getDefaultIngestConfigFR } from "./config";
import { collectJokePreviewFR } from "./preview";
import { insertJokeCandidatesFR, getNextPageForSourceFR, updateSourceStateFR } from "./storage";
import { JokeCandidateFR } from "./types";

export interface RunIngestOptionsFR {
  limit?: number;
}

export interface RunIngestResultFR {
  totalCollected: number;
  inserted: number;
  meta: Record<string, unknown>;
}

export const runIngestFR = async (): Promise<RunIngestResultFR> => {
  const config = getDefaultIngestConfigFR();
  const meta: Record<string, unknown> = {};
  const collected: JokeCandidateFR[] = [];

  // Fetch from Blague-drole.net
  if (config.blagueDrole.enabled) {
    const jokes: JokeCandidateFR[] = [];
    const blagueDroleMeta: Record<string, unknown>[] = [];

    console.log(`[FR] Fetching from ${config.blagueDrole.sources.length} Blague-drole.net categories...`);
    for (const source of config.blagueDrole.sources) {
      const sourceKey = `blague-drole:${source.category || 'main'}`;
      const nextPage = source.page || await getNextPageForSourceFR("blague-drole", sourceKey);

      console.log(`[FR] Fetching ${source.category || 'main page'} (page ${nextPage})...`);
      const preview = await collectJokePreviewFR({
        blagueDrole: {
          enabled: true,
          category: source.category,
          page: nextPage,
          baseUrl: source.baseUrl,
          timeoutMs: source.timeoutMs,
        },
      });
      jokes.push(...preview.jokes);
      if (preview.meta.blagueDrole && typeof preview.meta.blagueDrole === "object") {
        blagueDroleMeta.push(preview.meta.blagueDrole as Record<string, unknown>);
      }

      // Update source state
      await updateSourceStateFR("blague-drole", sourceKey, nextPage, preview.jokes.length);

      // Small delay between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`[FR] Collected ${jokes.length} jokes from Blague-drole.net`);
    collected.push(...jokes);
    meta.blagueDrole = blagueDroleMeta;
  }

  // Fetch from Blagues-en-stock (backup source)
  if (config.blaguesEnStock.enabled) {
    const jokes: JokeCandidateFR[] = [];
    const blaguesEnStockMeta: Record<string, unknown>[] = [];

    console.log(`[FR] Fetching from ${config.blaguesEnStock.sources.length} Blagues-en-stock categories...`);
    for (const source of config.blaguesEnStock.sources) {
      const sourceKey = `blagues-en-stock:${source.category}`;

      console.log(`[FR] Fetching category ${source.category}...`);
      const preview = await collectJokePreviewFR({
        blaguesEnStock: {
          enabled: true,
          category: source.category,
          baseUrl: source.baseUrl,
          timeoutMs: source.timeoutMs,
        },
      });
      jokes.push(...preview.jokes);
      if (preview.meta.blaguesEnStock && typeof preview.meta.blaguesEnStock === "object") {
        blaguesEnStockMeta.push(preview.meta.blaguesEnStock as Record<string, unknown>);
      }

      // Update source state (no pagination for this source)
      await updateSourceStateFR("blagues-en-stock", sourceKey, 1, preview.jokes.length);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`[FR] Collected ${jokes.length} jokes from Blagues-en-stock`);
    collected.push(...jokes);
    meta.blaguesEnStock = blaguesEnStockMeta;
  }

  // Fetch from Blague-humour.com
  if (config.blagueHumour.enabled) {
    const jokes: JokeCandidateFR[] = [];
    const blagueHumourMeta: Record<string, unknown>[] = [];

    console.log(`[FR] Fetching from ${config.blagueHumour.sources.length} Blague-humour.com categories...`);
    for (const source of config.blagueHumour.sources) {
      const sourceKey = `blague-humour:${source.category || 'main'}`;
      const nextPage = source.page || await getNextPageForSourceFR("blague-humour", sourceKey);

      console.log(`[FR] Fetching ${source.category || 'main page'} (page ${nextPage})...`);
      const preview = await collectJokePreviewFR({
        blagueHumour: {
          enabled: true,
          category: source.category,
          page: nextPage,
          baseUrl: source.baseUrl,
          timeoutMs: source.timeoutMs,
        },
      });
      jokes.push(...preview.jokes);
      if (preview.meta.blagueHumour && typeof preview.meta.blagueHumour === "object") {
        blagueHumourMeta.push(preview.meta.blagueHumour as Record<string, unknown>);
      }

      // Update source state
      await updateSourceStateFR("blague-humour", sourceKey, nextPage, preview.jokes.length);

      // Small delay between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`[FR] Collected ${jokes.length} jokes from Blague-humour.com`);
    collected.push(...jokes);
    meta.blagueHumour = blagueHumourMeta;
  }

  console.log(`[FR] Total collected: ${collected.length} jokes`);
  const { inserted } = await insertJokeCandidatesFR(collected);
  console.log(`[FR] Inserted: ${inserted} new jokes`);

  return {
    totalCollected: collected.length,
    inserted,
    meta,
  };
};
