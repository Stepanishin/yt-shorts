const DEFAULT_ENDPOINT = "https://v2.jokeapi.dev/joke/Any";
const DEFAULT_TIMEOUT_MS = 8000;

interface FetchContext {
  endpoint: string;
  timeoutMs: number;
  categories?: string[];
  blacklistFlags?: string[];
}

export interface JokeAPIFetchOptions {
  endpoint?: string;
  timeoutMs?: number;
  categories?: string[]; // Programming, Misc, Dark, Pun, Spooky, Christmas
  blacklistFlags?: string[]; // nsfw, religious, political, racist, sexist, explicit
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface JokeAPIFetchSuccess {
  ok: true;
  joke: {
    text: string;
    id: number;
    category?: string;
    type?: string;
    flags?: Record<string, boolean>;
  };
  meta: {
    endpoint: string;
    durationMs: number;
    raw: unknown;
  };
}

export interface JokeAPIFetchError {
  ok: false;
  error: {
    message: string;
    status?: number;
    endpoint: string;
    cause?: unknown;
  };
}

export type JokeAPIFetchResult = JokeAPIFetchSuccess | JokeAPIFetchError;

const resolveContext = (options: JokeAPIFetchOptions = {}): FetchContext => {
  const endpoint = options.endpoint?.trim() || DEFAULT_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    endpoint,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    categories: options.categories,
    blacklistFlags: options.blacklistFlags,
  };
};

const buildUrl = (context: FetchContext): string => {
  const categories = context.categories?.length ? context.categories.join(",") : "Any";
  const url = new URL(`https://v2.jokeapi.dev/joke/${categories}`);

  // Always request German language
  url.searchParams.set("lang", "de");

  // Add blacklist flags if specified
  if (context.blacklistFlags?.length) {
    url.searchParams.set("blacklistFlags", context.blacklistFlags.join(","));
  }

  return url.toString();
};

const parseJokeText = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  // JokeAPI has two formats:
  // 1. "single" type: { joke: "text" }
  // 2. "twopart" type: { setup: "text", delivery: "text" }

  if (record.type === "single" && typeof record.joke === "string") {
    return record.joke.trim();
  }

  if (record.type === "twopart") {
    const setup = typeof record.setup === "string" ? record.setup.trim() : "";
    const delivery = typeof record.delivery === "string" ? record.delivery.trim() : "";
    if (setup && delivery) {
      return `${setup}\n\n${delivery}`;
    }
  }

  return undefined;
};

export async function fetchJokeAPIRandomJoke(
  options: JokeAPIFetchOptions = {}
): Promise<JokeAPIFetchResult> {
  const context = resolveContext(options);
  const endpoint = buildUrl(context);
  const fetchImpl = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), context.timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; ShortsGeneratorBot/1.0; +https://example.com/bot)",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

    if (!response.ok) {
      const preview = await safeReadText(response);
      return {
        ok: false,
        error: {
          message: `JokeAPI responded with status ${response.status}` + (preview ? `: ${preview}` : ""),
          status: response.status,
          endpoint,
        },
      };
    }

    const payload = await response.json();

    // Check if API returned an error
    if (payload.error === true) {
      return {
        ok: false,
        error: {
          message: payload.message || "JokeAPI returned an error",
          status: response.status,
          endpoint,
          cause: payload,
        },
      };
    }

    const text = parseJokeText(payload);

    if (!text) {
      return {
        ok: false,
        error: {
          message: "JokeAPI response did not contain recognizable joke text",
          status: response.status,
          endpoint,
          cause: payload,
        },
      };
    }

    return {
      ok: true,
      joke: {
        text,
        id: typeof payload.id === "number" ? payload.id : 0,
        category: typeof payload.category === "string" ? payload.category : undefined,
        type: typeof payload.type === "string" ? payload.type : undefined,
        flags: typeof payload.flags === "object" ? payload.flags as Record<string, boolean> : undefined,
      },
      meta: {
        endpoint,
        durationMs,
        raw: payload,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message:
          error instanceof Error && error.name === "AbortError"
            ? `Request to JokeAPI timed out after ${context.timeoutMs}ms`
            : "Failed to fetch joke from JokeAPI",
        endpoint,
        cause: error,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

const safeReadText = async (response: Response): Promise<string | undefined> => {
  try {
    const text = await response.text();
    return text?.slice(0, 160);
  } catch {
    return undefined;
  }
};
