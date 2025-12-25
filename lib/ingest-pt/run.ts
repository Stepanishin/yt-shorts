import { getDefaultIngestConfigPT } from "./config";
import { collectJokePreviewPT } from "./preview";
import { insertJokeCandidatesPT, getNextPageForSourcePT, updateSourceStatePT } from "./storage";
import { JokeCandidatePT } from "./types";

export interface RunIngestOptionsPT {
  limit?: number;
}

export interface RunIngestResultPT {
  totalCollected: number;
  inserted: number;
  meta: Record<string, unknown>;
}

export const runIngestPT = async (): Promise<RunIngestResultPT> => {
  const config = getDefaultIngestConfigPT();
  const meta: Record<string, unknown> = {};
  const collected: JokeCandidatePT[] = [];

  // Fetch from PIADA.COM
  if (config.piadacom.enabled) {
    const jokes: JokeCandidatePT[] = [];
    const piadacomMeta: Record<string, unknown>[] = [];

    console.log(`[PT] Fetching from ${config.piadacom.sources.length} PIADA.COM categories...`);
    for (const source of config.piadacom.sources) {
      const sourceKey = `piadacom:${source.category}`;
      const nextPage = await getNextPageForSourcePT("piadacom", sourceKey);

      console.log(`[PT] Fetching category ${source.category} (page ${nextPage})...`);
      const preview = await collectJokePreviewPT({
        piadacom: {
          enabled: true,
          category: source.category,
          page: nextPage,
          baseUrl: source.baseUrl,
          timeoutMs: source.timeoutMs,
        },
      });
      jokes.push(...preview.jokes);
      if (preview.meta.piadacom && typeof preview.meta.piadacom === "object") {
        piadacomMeta.push(preview.meta.piadacom as Record<string, unknown>);
      }

      // Update source state
      await updateSourceStatePT("piadacom", sourceKey, nextPage, preview.jokes.length);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[PT] Collected ${jokes.length} jokes from PIADA.COM`);
    collected.push(...jokes);
    meta.piadacom = piadacomMeta;
  }

  console.log(`[PT] Total collected: ${collected.length} jokes`);
  const { inserted } = await insertJokeCandidatesPT(collected);
  console.log(`[PT] Inserted: ${inserted} new jokes`);

  return {
    totalCollected: collected.length,
    inserted,
    meta,
  };
};
