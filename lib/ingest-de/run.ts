import { getDefaultIngestConfigDE } from "./config";
import { collectJokePreviewDE } from "./preview";
import { insertJokeCandidatesDE, getNextPageForSourceDE, updateSourceStateDE } from "./storage";
import { JokeCandidateDE } from "./types";

export interface RunIngestOptionsDE {
  limit?: number;
}

export interface RunIngestResultDE {
  totalCollected: number;
  inserted: number;
  meta: Record<string, unknown>;
}

export const runIngestDE = async (): Promise<RunIngestResultDE> => {
  const config = getDefaultIngestConfigDE();
  const meta: Record<string, unknown> = {};
  const collected: JokeCandidateDE[] = [];

  // Fetch from JokeAPI (multiple requests to get more jokes)
  if (config.jokeapi.enabled) {
    const jokes: JokeCandidateDE[] = [];
    const jokeapiMeta: Record<string, unknown>[] = [];

    // Fetch 20 jokes from JokeAPI (increased from 5)
    const numRequests = 20;
    console.log(`[DE] Fetching ${numRequests} jokes from JokeAPI...`);
    for (let i = 0; i < numRequests; i++) {
      const preview = await collectJokePreviewDE({
        jokeapi: {
          enabled: true,
          endpoint: config.jokeapi.endpoint,
          categories: config.jokeapi.categories,
          blacklistFlags: config.jokeapi.blacklistFlags,
          timeoutMs: config.jokeapi.timeoutMs,
        },
      });

      jokes.push(...preview.jokes);
      if (preview.meta.jokeapi && typeof preview.meta.jokeapi === "object") {
        jokeapiMeta.push(preview.meta.jokeapi as Record<string, unknown>);
      }

      // Small delay between requests to avoid rate limiting (120 requests per minute = 500ms per request)
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    console.log(`[DE] Collected ${jokes.length} jokes from JokeAPI`);
    collected.push(...jokes);
    meta.jokeapi = jokeapiMeta;
  }

  // Fetch from Aberwitzig
  if (config.aberwitzig.enabled) {
    const jokes: JokeCandidateDE[] = [];
    const aberwitzigMeta: Record<string, unknown>[] = [];

    console.log(`[DE] Fetching from ${config.aberwitzig.sources.length} Aberwitzig categories...`);
    for (const source of config.aberwitzig.sources) {
      const sourceKey = `aberwitzig:${source.category}`;
      const nextPart = await getNextPageForSourceDE("aberwitzig", sourceKey);

      console.log(`[DE] Fetching ${source.category} (part ${nextPart})...`);
      const preview = await collectJokePreviewDE({
        aberwitzig: {
          enabled: true,
          category: source.category,
          part: nextPart,
          baseUrl: source.baseUrl,
          timeoutMs: source.timeoutMs,
        },
      });
      jokes.push(...preview.jokes);
      if (preview.meta.aberwitzig && typeof preview.meta.aberwitzig === "object") {
        aberwitzigMeta.push(preview.meta.aberwitzig as Record<string, unknown>);
      }

      // Update source state
      await updateSourceStateDE("aberwitzig", sourceKey, nextPart, preview.jokes.length);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[DE] Collected ${jokes.length} jokes from Aberwitzig`);
    collected.push(...jokes);
    meta.aberwitzig = aberwitzigMeta;
  }

  console.log(`[DE] Total collected: ${collected.length} jokes`);
  const { inserted } = await insertJokeCandidatesDE(collected);
  console.log(`[DE] Inserted: ${inserted} new jokes`);

  return {
    totalCollected: collected.length,
    inserted,
    meta,
  };
};
