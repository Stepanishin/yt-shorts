import { fetchChistesRandomJoke } from "@/lib/sources/chistes";
import { fetchTodoChistesPosts } from "@/lib/sources/todochistes";
import { fetchYavendrasCategory } from "@/lib/sources/yavendras";
import { cleanJokeHtml } from "@/lib/utils/text-cleaner";

import {
  JokeCandidate,
  JokePreviewBundle,
  JokePreviewRequest,
} from "./types";

export async function collectJokePreview(
  request: JokePreviewRequest
): Promise<JokePreviewBundle> {
  const jokes: JokeCandidate[] = [];
  const meta: Record<string, unknown> = {};

  if (request.chistes?.enabled !== false) {
    const result = await fetchChistesRandomJoke({
      endpoint: request.chistes?.endpoint,
      timeoutMs: request.chistes?.timeoutMs,
    });

    if (result.ok) {
      jokes.push({
        source: "chistes",
        title: result.joke.title,
        text: result.joke.text,
        externalId: result.joke.id,
        language: "es",
        meta: {
          endpoint: result.meta.endpoint,
          durationMs: result.meta.durationMs,
        },
      });
      meta.chistes = { status: "ok", endpoint: result.meta.endpoint };
    } else {
      meta.chistes = {
        status: "error",
        message: result.error.message,
        endpoint: result.error.endpoint,
        statusCode: result.error.status,
      };
    }
  }

  if (request.yavendras?.enabled !== false && request.yavendras?.slug) {
    const result = await fetchYavendrasCategory({
      slug: request.yavendras.slug,
      page: request.yavendras.page,
      baseUrl: request.yavendras.baseUrl,
      timeoutMs: request.yavendras.timeoutMs,
    });

    if (result.ok) {
      jokes.push(
        ...result.jokes.map<JokeCandidate>((joke) => {
          // Извлекаем ID из URL или используем URL как externalId
          // URL обычно выглядит как: https://chistes.yavendras.com/chiste.php?id=12345
          // или https://chistes.yavendras.com/chistes/pepito/12345
          let externalId: string | undefined;
          if (joke.url) {
            // Пытаемся извлечь ID из URL
            const urlMatch = joke.url.match(/[?&]id=(\d+)/) || joke.url.match(/\/(\d+)\.php/);
            if (urlMatch && urlMatch[1]) {
              externalId = urlMatch[1];
            } else {
              // Если ID не найден, используем URL как externalId
              externalId = joke.url;
            }
          }

          return {
            source: "yavendras",
            title: joke.title,
            text: joke.text,
            url: joke.url,
            externalId, // Добавляем externalId
            language: "es",
            ratingPercent: joke.ratingPercent,
            votesTotal: joke.votesTotal,
            votesPositive: joke.votesPositive,
            votesNegative: joke.votesNegative,
            meta: {
              slug: request.yavendras?.slug,
              page: request.yavendras?.page ?? 1,
            },
          };
        })
      );

      meta.yavendras = {
        status: "ok",
        slug: request.yavendras.slug,
        page: request.yavendras.page ?? 1,
        fetched: result.jokes.length,
      };
    } else {
      meta.yavendras = {
        status: "error",
        message: result.error.message,
        url: result.error.url,
        statusCode: result.error.status,
      };
    }
  }

  if (request.todochistes?.enabled !== false) {
    const result = await fetchTodoChistesPosts({
      categoryId: request.todochistes?.categoryId,
      categorySlug: request.todochistes?.categorySlug,
      baseUrl: request.todochistes?.baseUrl,
      page: request.todochistes?.page,
      perPage: request.todochistes?.perPage,
      timeoutMs: request.todochistes?.timeoutMs,
    });

    if (result.ok) {
      jokes.push(
        ...result.posts.map<JokeCandidate>((post) => ({
          source: "todochistes",
          title: cleanJokeHtml(post.title),
          text: cleanJokeHtml(post.content),
          rawHtml: post.content,
          url: post.link,
          externalId: String(post.id),
          language: "es",
          meta: {
            slug: post.slug,
            categories: post.categories,
            date: post.date,
          },
        }))
      );

      meta.todochistes = {
        status: "ok",
        page: result.meta.page,
        perPage: result.meta.perPage,
        fetched: result.posts.length,
        categoryId: result.meta.categoryId,
        categorySlug: result.meta.categorySlug,
      };
    } else {
      meta.todochistes = {
        status: "error",
        message: result.error.message,
        url: result.error.url,
        statusCode: result.error.status,
      };
    }
  }

  return { jokes, meta };
}

// Функция stripHtml удалена - теперь используем cleanJokeHtml из utils/text-cleaner

