import { fetchChistesRandomJoke } from "@/lib/sources/chistes";
import { fetchTodoChistesPosts } from "@/lib/sources/todochistes";
import { fetchYavendrasCategory } from "@/lib/sources/yavendras";

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
        ...result.jokes.map<JokeCandidate>((joke) => ({
          source: "yavendras",
          title: joke.title,
          text: joke.text,
          url: joke.url,
          language: "es",
          ratingPercent: joke.ratingPercent,
          votesTotal: joke.votesTotal,
          votesPositive: joke.votesPositive,
          votesNegative: joke.votesNegative,
          meta: {
            slug: request.yavendras?.slug,
            page: request.yavendras?.page ?? 1,
          },
        }))
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
          title: stripHtml(post.title),
          text: stripHtml(post.content),
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

const stripHtml = (value: string): string =>
  value
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

