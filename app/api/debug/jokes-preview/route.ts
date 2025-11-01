import { NextResponse } from "next/server";

import { collectJokePreview } from "@/lib/ingest/preview";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Endpoint disabled in production" }, { status: 404 });
  }

  const url = new URL(request.url);

  const chistesEnabled = url.searchParams.get("chistes") !== "false";
  const chistesEndpoint = url.searchParams.get("chistesEndpoint") || undefined;
  const chistesTimeout = parseNumberParam(url.searchParams.get("chistesTimeoutMs"));

  const yavSlug = url.searchParams.get("yavSlug") || undefined;
  const yavEnabled = yavSlug ? url.searchParams.get("yavEnabled") !== "false" : false;
  const yavPage = parseNumberParam(url.searchParams.get("yavPage"));
  const yavBase = url.searchParams.get("yavBaseUrl") || undefined;
  const yavTimeout = parseNumberParam(url.searchParams.get("yavTimeoutMs"));

  const todoEnabled = url.searchParams.get("todoEnabled") !== "false";
  const todoCategoryId = parseNumberParam(url.searchParams.get("todoCategoryId"));
  const todoCategorySlug = url.searchParams.get("todoCategorySlug") || undefined;
  const todoPage = parseNumberParam(url.searchParams.get("todoPage"));
  const todoPerPage = parseNumberParam(url.searchParams.get("todoPerPage"));
  const todoBase = url.searchParams.get("todoBaseUrl") || undefined;
  const todoTimeout = parseNumberParam(url.searchParams.get("todoTimeoutMs"));

  const result = await collectJokePreview({
    chistes: chistesEnabled
      ? {
          enabled: chistesEnabled,
          endpoint: chistesEndpoint,
          timeoutMs: chistesTimeout,
        }
      : undefined,
    yavendras: yavEnabled && yavSlug
      ? {
          enabled: true,
          slug: yavSlug,
          page: yavPage,
          baseUrl: yavBase,
          timeoutMs: yavTimeout,
        }
      : undefined,
    todochistes: todoEnabled
      ? {
          enabled: true,
          categoryId: todoCategoryId,
          categorySlug: todoCategorySlug,
          baseUrl: todoBase,
          page: todoPage,
          perPage: todoPerPage,
          timeoutMs: todoTimeout,
        }
      : undefined,
  });

  return NextResponse.json(result);
}

const parseNumberParam = (value: string | null): number | undefined => {
  if (!value) {
    return undefined;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

