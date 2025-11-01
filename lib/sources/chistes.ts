const DEFAULT_ENDPOINT = "https://api.chistes.com/random";
const DEFAULT_TIMEOUT_MS = 8000;

interface FetchContext {
  endpoint: string;
  timeoutMs: number;
}

export interface ChistesFetchOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface ChistesFetchSuccess {
  ok: true;
  joke: {
    text: string;
    id?: string;
    title?: string;
  };
  meta: {
    endpoint: string;
    durationMs: number;
    raw: unknown;
  };
}

export interface ChistesFetchError {
  ok: false;
  error: {
    message: string;
    status?: number;
    endpoint: string;
    cause?: unknown;
  };
}

export type ChistesFetchResult = ChistesFetchSuccess | ChistesFetchError;

const resolveContext = (options: ChistesFetchOptions = {}): FetchContext => {
  const envEndpoint = process.env.CHISTES_API_ENDPOINT?.trim();
  const endpoint = options.endpoint?.trim() || envEndpoint || DEFAULT_ENDPOINT;

  const envTimeout = process.env.CHISTES_API_TIMEOUT_MS;
  const timeoutMs = options.timeoutMs ?? (envTimeout ? Number(envTimeout) : DEFAULT_TIMEOUT_MS);

  return {
    endpoint,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
};

const pickText = (payload: unknown): { text?: string; id?: string; title?: string } => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;

  const candidates = [
    record.chiste,
    record.joke,
    record.texto,
    record.text,
    record.body,
    record.contenido,
  ];

  const text = candidates.find((value) => typeof value === "string" && value.trim().length > 0) as
    | string
    | undefined;

  const idCandidates = [record.id, record.ID, record.contentId, record.chisteId, record.uuid];
  const idValue = idCandidates.find((value) => typeof value === "string" || typeof value === "number");
  const id = typeof idValue === "number" ? String(idValue) : (idValue as string | undefined);

  const titleCandidates = [record.title, record.titulo, record.heading];
  const title = titleCandidates.find((value) => typeof value === "string") as string | undefined;

  return {
    text: text?.trim(),
    id,
    title: title?.trim(),
  };
};

export async function fetchChistesRandomJoke(
  options: ChistesFetchOptions = {}
): Promise<ChistesFetchResult> {
  const { endpoint, timeoutMs } = resolveContext(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
        Accept: "application/json, text/plain;q=0.9",
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
          message: `Chistes API responded with status ${response.status}` + (preview ? `: ${preview}` : ""),
          status: response.status,
          endpoint,
        },
      };
    }

    const payload = await safeParseJson(response);
    const { text, id, title } = pickText(payload);

    if (!text) {
      return {
        ok: false,
        error: {
          message: "Chistes API response did not contain recognizable joke text",
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
        id,
        title,
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
            ? `Request to Chistes API timed out after ${timeoutMs}ms`
            : "Failed to fetch joke from Chistes API",
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

const safeParseJson = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") || "";
  const trimmed = contentType.toLowerCase().trim();

  if (trimmed.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

