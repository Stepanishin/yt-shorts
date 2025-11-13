import { getDefaultIngestConfig } from "./config";
import { collectJokePreview } from "./preview";
import { insertJokeCandidates, getNextPageForSource, updateSourceState } from "./storage";
import { JokeCandidate } from "./types";

export interface RunIngestOptions {
  limit?: number;
}

export interface RunIngestResult {
  totalCollected: number;
  inserted: number;
  meta: Record<string, unknown>;
}

export const runIngest = async (): Promise<RunIngestResult> => {
  const config = getDefaultIngestConfig();
  const meta: Record<string, unknown> = {};
  const collected: JokeCandidate[] = [];

  if (config.chistes.enabled) {
    const preview = await collectJokePreview({
      chistes: {
        enabled: true,
        endpoint: config.chistes.endpoint,
        timeoutMs: config.chistes.timeoutMs,
      },
    });

    meta.chistes = preview.meta.chistes;
    collected.push(...preview.jokes);
  }

  if (config.yavendras.enabled) {
    const jokes: JokeCandidate[] = [];
    const yavMeta: Record<string, unknown>[] = [];

    for (const source of config.yavendras.sources) {
      const sourceKey = `yavendras:${source.slug}`;
      const nextPage = await getNextPageForSource("yavendras", sourceKey);

      const preview = await collectJokePreview({
        yavendras: {
          enabled: true,
          slug: source.slug,
          page: nextPage,
          baseUrl: source.baseUrl,
          timeoutMs: source.timeoutMs,
        },
      });
      jokes.push(...preview.jokes);
      if (preview.meta.yavendras && typeof preview.meta.yavendras === "object") {
        yavMeta.push(preview.meta.yavendras as Record<string, unknown>);
      }

      // Обновляем состояние источника
      await updateSourceState("yavendras", sourceKey, nextPage, preview.jokes.length);
    }

    collected.push(...jokes);
    meta.yavendras = yavMeta;
  }

  if (config.todochistes.enabled) {
    const jokes: JokeCandidate[] = [];
    const todoMeta: Record<string, unknown>[] = [];

    for (const source of config.todochistes.sources) {
      const sourceKey = `todochistes:${source.categorySlug || source.categoryId}`;
      const nextPage = await getNextPageForSource("todochistes", sourceKey);

      const preview = await collectJokePreview({
        todochistes: {
          enabled: true,
          categoryId: source.categoryId,
          categorySlug: source.categorySlug,
          page: nextPage,
          perPage: source.perPage,
          baseUrl: source.baseUrl,
          timeoutMs: source.timeoutMs,
        },
      });
      jokes.push(...preview.jokes);
      if (preview.meta.todochistes && typeof preview.meta.todochistes === "object") {
        todoMeta.push(preview.meta.todochistes as Record<string, unknown>);
      }

      // Обновляем состояние источника
      await updateSourceState("todochistes", sourceKey, nextPage, preview.jokes.length);
    }

    collected.push(...jokes);
    meta.todochistes = todoMeta;
  }

  const { inserted } = await insertJokeCandidates(collected);

  return {
    totalCollected: collected.length,
    inserted,
    meta,
  };
};

