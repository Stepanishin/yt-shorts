import { fetchBlagueDroleCategory } from "@/lib/sources-fr/blague-drole";
import { fetchBlaguesEnStockCategory } from "@/lib/sources-fr/blagues-en-stock";
import { fetchBlagueHumourCategory } from "@/lib/sources-fr/blague-humour";
import { JokeCandidateFR, JokePreviewRequestFR, JokePreviewBundleFR } from "./types";

/**
 * Collect French joke previews from various sources
 */
export async function collectJokePreviewFR(
  request: JokePreviewRequestFR
): Promise<JokePreviewBundleFR> {
  const jokes: JokeCandidateFR[] = [];
  const meta: Record<string, unknown> = {};

  // Fetch from Blague-drole.net
  if (request.blagueDrole?.enabled) {
    const result = await fetchBlagueDroleCategory({
      category: request.blagueDrole.category,
      page: request.blagueDrole.page,
      baseUrl: request.blagueDrole.baseUrl,
      timeoutMs: request.blagueDrole.timeoutMs,
    });

    if (result.ok) {
      for (const joke of result.jokes) {
        jokes.push({
          source: "blague-drole",
          text: joke.text,
          url: joke.url,
          category: joke.category,
          title: joke.title,
          author: joke.author,
          externalId: joke.id,
          language: "fr",
        });
      }
      meta.blagueDrole = {
        success: true,
        url: result.meta.url,
        category: result.meta.category,
        page: result.meta.page,
        durationMs: result.meta.durationMs,
        jokesCount: result.jokes.length,
      };
    } else {
      meta.blagueDrole = {
        success: false,
        error: result.error.message,
        url: result.error.url,
      };
    }
  }

  // Fetch from Blagues-en-stock (backup source)
  if (request.blaguesEnStock?.enabled) {
    const result = await fetchBlaguesEnStockCategory({
      category: request.blaguesEnStock.category,
      baseUrl: request.blaguesEnStock.baseUrl,
      timeoutMs: request.blaguesEnStock.timeoutMs,
    });

    if (result.ok) {
      for (const joke of result.jokes) {
        jokes.push({
          source: "blagues-en-stock",
          text: joke.text,
          url: joke.url,
          category: joke.category,
          author: joke.author,
          language: "fr",
        });
      }
      meta.blaguesEnStock = {
        success: true,
        url: result.meta.url,
        category: result.meta.category,
        durationMs: result.meta.durationMs,
        jokesCount: result.jokes.length,
      };
    } else {
      meta.blaguesEnStock = {
        success: false,
        error: result.error.message,
        url: result.error.url,
      };
    }
  }

  // Fetch from Blague-humour.com
  if (request.blagueHumour?.enabled) {
    const result = await fetchBlagueHumourCategory({
      category: request.blagueHumour.category,
      page: request.blagueHumour.page,
      baseUrl: request.blagueHumour.baseUrl,
      timeoutMs: request.blagueHumour.timeoutMs,
    });

    if (result.ok) {
      for (const joke of result.jokes) {
        jokes.push({
          source: "blague-humour",
          text: joke.text,
          url: joke.url,
          category: joke.category,
          title: joke.title,
          externalId: joke.id,
          language: "fr",
        });
      }
      meta.blagueHumour = {
        success: true,
        url: result.meta.url,
        category: result.meta.category,
        page: result.meta.page,
        durationMs: result.meta.durationMs,
        jokesCount: result.jokes.length,
      };
    } else {
      meta.blagueHumour = {
        success: false,
        error: result.error.message,
        url: result.error.url,
      };
    }
  }

  return { jokes, meta };
}
