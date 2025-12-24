import { fetchJokeAPIRandomJoke } from "@/lib/sources-de/jokeapi";
import { fetchAberwitzigCategory } from "@/lib/sources-de/aberwitzig";
import { fetchProgrammwechselPage } from "@/lib/sources-de/programmwechsel";
import { JokeCandidateDE, JokePreviewRequestDE, JokePreviewBundleDE } from "./types";

export async function collectJokePreviewDE(
  request: JokePreviewRequestDE
): Promise<JokePreviewBundleDE> {
  const jokes: JokeCandidateDE[] = [];
  const meta: Record<string, unknown> = {};

  // Fetch from JokeAPI
  if (request.jokeapi?.enabled) {
    const result = await fetchJokeAPIRandomJoke({
      endpoint: request.jokeapi.endpoint,
      categories: request.jokeapi.categories,
      blacklistFlags: request.jokeapi.blacklistFlags,
      timeoutMs: request.jokeapi.timeoutMs,
    });

    if (result.ok) {
      jokes.push({
        source: "jokeapi",
        text: result.joke.text,
        externalId: String(result.joke.id),
        url: result.meta.endpoint,
        category: result.joke.category,
        language: "de",
        meta: {
          type: result.joke.type,
          flags: result.joke.flags,
        },
      });
      meta.jokeapi = {
        success: true,
        endpoint: result.meta.endpoint,
        durationMs: result.meta.durationMs,
        jokeId: result.joke.id,
      };
    } else {
      meta.jokeapi = {
        success: false,
        error: result.error.message,
        endpoint: result.error.endpoint,
      };
    }
  }

  // Fetch from Aberwitzig
  if (request.aberwitzig?.enabled) {
    const result = await fetchAberwitzigCategory({
      category: request.aberwitzig.category,
      part: request.aberwitzig.part,
      baseUrl: request.aberwitzig.baseUrl,
      timeoutMs: request.aberwitzig.timeoutMs,
    });

    if (result.ok) {
      for (const joke of result.jokes) {
        jokes.push({
          source: "aberwitzig",
          text: joke.text,
          url: joke.url,
          category: joke.category,
          language: "de",
        });
      }
      meta.aberwitzig = {
        success: true,
        url: result.meta.url,
        category: result.meta.category,
        part: result.meta.part,
        durationMs: result.meta.durationMs,
        jokesCount: result.jokes.length,
      };
    } else {
      meta.aberwitzig = {
        success: false,
        error: result.error.message,
        url: result.error.url,
      };
    }
  }

  // Fetch from Programmwechsel
  if (request.programmwechsel?.enabled) {
    const result = await fetchProgrammwechselPage({
      pagePath: request.programmwechsel.pagePath,
      baseUrl: request.programmwechsel.baseUrl,
      timeoutMs: request.programmwechsel.timeoutMs,
    });

    if (result.ok) {
      for (const joke of result.jokes) {
        jokes.push({
          source: "programmwechsel",
          text: joke.text,
          url: joke.url,
          category: joke.category,
          language: "de",
        });
      }
      meta.programmwechsel = {
        success: true,
        url: result.meta.url,
        pagePath: result.meta.pagePath,
        durationMs: result.meta.durationMs,
        jokesCount: result.jokes.length,
      };
    } else {
      meta.programmwechsel = {
        success: false,
        error: result.error.message,
        url: result.error.url,
      };
    }
  }

  return { jokes, meta };
}
