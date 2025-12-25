import { fetchPiadaComCategory } from "@/lib/sources-pt/piada-com";
import { JokeCandidatePT, JokePreviewRequestPT, JokePreviewBundlePT } from "./types";

export async function collectJokePreviewPT(
  request: JokePreviewRequestPT
): Promise<JokePreviewBundlePT> {
  const jokes: JokeCandidatePT[] = [];
  const meta: Record<string, unknown> = {};

  // Fetch from PIADA.COM
  if (request.piadacom?.enabled) {
    const result = await fetchPiadaComCategory({
      category: request.piadacom.category,
      page: request.piadacom.page,
      baseUrl: request.piadacom.baseUrl,
      timeoutMs: request.piadacom.timeoutMs,
    });

    if (result.ok) {
      for (const joke of result.jokes) {
        jokes.push({
          source: "piadacom",
          text: joke.text,
          url: joke.url,
          category: joke.category,
          externalId: joke.id,
          language: "pt",
        });
      }
      meta.piadacom = {
        success: true,
        url: result.meta.url,
        category: result.meta.category,
        page: result.meta.page,
        durationMs: result.meta.durationMs,
        jokesCount: result.jokes.length,
      };
    } else {
      meta.piadacom = {
        success: false,
        error: result.error.message,
        url: result.error.url,
      };
    }
  }

  return { jokes, meta };
}
