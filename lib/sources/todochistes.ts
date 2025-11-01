const BASE_URL = "https://www.todochistes.net";
const DEFAULT_TIMEOUT_MS = 10000;
const POSTS_ENDPOINT = "/wp-json/wp/v2/posts";
const CATEGORIES_ENDPOINT = "/wp-json/wp/v2/categories";

export interface TodoChistesPost {
  id: number;
  slug: string;
  link: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  categories: number[];
}

export interface FetchTodoChistesOptions {
  categoryId?: number;
  categorySlug?: string;
  page?: number;
  perPage?: number;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchTodoChistesSuccess {
  ok: true;
  posts: TodoChistesPost[];
  meta: {
    url: string;
    page: number;
    perPage: number;
    durationMs: number;
    categoryId?: number;
    categorySlug?: string;
  };
}

export interface FetchTodoChistesError {
  ok: false;
  error: {
    message: string;
    url: string;
    status?: number;
    cause?: unknown;
  };
}

export type FetchTodoChistesResult = FetchTodoChistesSuccess | FetchTodoChistesError;

export async function fetchTodoChistesPosts(
  options: FetchTodoChistesOptions = {}
): Promise<FetchTodoChistesResult> {
  const {
    categoryId,
    categorySlug,
    page = 1,
    perPage = 10,
    baseUrl = BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  let resolvedCategoryId: number | undefined = categoryId;

  if (!resolvedCategoryId && categorySlug) {
    const lookupResult = await resolveCategoryId({
      slug: categorySlug,
      baseUrl,
      timeoutMs,
      fetchImpl,
    });

    if (!lookupResult.ok) {
      return lookupResult;
    }

    resolvedCategoryId = lookupResult.categoryId;
  }

  const url = buildPostsUrl({ baseUrl, page, perPage, categoryId: resolvedCategoryId });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; ShortsGeneratorBot/1.0; +https://example.com/bot)",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        error: {
          message: `TodoChistes responded with status ${response.status}`,
          status: response.status,
          url,
        },
      };
    }

    const payload = (await response.json()) as unknown;
    const posts = Array.isArray(payload)
      ? payload.map(mapPostPayload).filter((post): post is TodoChistesPost => Boolean(post))
      : [];

    return {
      ok: true,
      posts,
      meta: {
        url,
        page,
        perPage,
        durationMs,
        categoryId: resolvedCategoryId,
        categorySlug,
      },
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: isAbort
          ? `Request to TodoChistes timed out after ${timeoutMs}ms`
          : "Failed to fetch TodoChistes posts",
        url,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

interface ResolveCategoryResultOk {
  ok: true;
  categoryId: number;
}

type ResolveCategoryResult = ResolveCategoryResultOk | FetchTodoChistesError;

const resolveCategoryId = async ({
  slug,
  baseUrl,
  timeoutMs,
  fetchImpl,
}: {
  slug: string;
  baseUrl: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<ResolveCategoryResult> => {
  const url = buildCategoriesUrl(baseUrl, slug);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; ShortsGeneratorBot/1.0; +https://example.com/bot)",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: {
          message: `TodoChistes categories responded with status ${response.status}`,
          status: response.status,
          url,
        },
      };
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload) || payload.length === 0) {
      return {
        ok: false,
        error: {
          message: `Category slug "${slug}" not found on TodoChistes`,
          url,
        },
      };
    }

    const category = payload[0] as { id?: unknown };
    const id = typeof category.id === "number" ? category.id : undefined;

    if (!id) {
      return {
        ok: false,
        error: {
          message: `Category slug "${slug}" missing numeric id`,
          url,
        },
      };
    }

    return { ok: true, categoryId: id };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: {
        message: isAbort
          ? `TodoChistes category lookup timed out after ${timeoutMs}ms`
          : "Failed to resolve TodoChistes category",
        url,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};

const buildPostsUrl = ({
  baseUrl,
  page,
  perPage,
  categoryId,
}: {
  baseUrl: string;
  page: number;
  perPage: number;
  categoryId?: number;
}): string => {
  const url = new URL(POSTS_ENDPOINT, ensureTrailingSlash(baseUrl));
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  url.searchParams.set("_embed", "true");

  if (categoryId) {
    url.searchParams.set("categories", String(categoryId));
  }

  return url.toString();
};

const buildCategoriesUrl = (baseUrl: string, slug: string): string => {
  const url = new URL(CATEGORIES_ENDPOINT, ensureTrailingSlash(baseUrl));
  url.searchParams.set("slug", slug);
  url.searchParams.set("per_page", "1");
  return url.toString();
};

const ensureTrailingSlash = (value: string): string => (value.endsWith("/") ? value : `${value}/`);

const mapPostPayload = (payload: unknown): TodoChistesPost | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const id = typeof record.id === "number" ? record.id : undefined;
  const slug = typeof record.slug === "string" ? record.slug : undefined;
  const link = typeof record.link === "string" ? record.link : undefined;
  const date = typeof record.date === "string" ? record.date : undefined;
  const categories = Array.isArray(record.categories)
    ? (record.categories.filter((value) => typeof value === "number") as number[])
    : [];

  const title = extractRendered(record.title);
  const excerpt = extractRendered(record.excerpt);
  const content = extractRendered(record.content);

  if (!id || !slug || !link || !title || !content) {
    return undefined;
  }

  return {
    id,
    slug,
    link,
    title,
    excerpt: excerpt || "",
    content,
    date: date || new Date().toISOString(),
    categories,
  };
};

const extractRendered = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const rendered = (value as Record<string, unknown>).rendered;
  if (typeof rendered === "string") {
    return rendered.trim();
  }

  return undefined;
};

