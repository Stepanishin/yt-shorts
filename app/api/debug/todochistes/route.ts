import { NextResponse } from "next/server";

import { fetchTodoChistesPosts } from "@/lib/sources/todochistes";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Endpoint disabled in production" }, { status: 404 });
  }

  const url = new URL(request.url);
  const pageParam = url.searchParams.get("page");
  const perPageParam = url.searchParams.get("perPage");
  const categoryIdParam = url.searchParams.get("categoryId");
  const categorySlug = url.searchParams.get("categorySlug") || undefined;
  const baseUrl = url.searchParams.get("baseUrl") || undefined;
  const timeoutParam = url.searchParams.get("timeoutMs");

  const page = pageParam ? Number(pageParam) : undefined;
  const perPage = perPageParam ? Number(perPageParam) : undefined;
  const categoryId = categoryIdParam ? Number(categoryIdParam) : undefined;
  const timeoutMs = timeoutParam ? Number(timeoutParam) : undefined;

  const result = await fetchTodoChistesPosts({
    page: Number.isFinite(page) && page! > 0 ? page : undefined,
    perPage: Number.isFinite(perPage) && perPage! > 0 ? perPage : undefined,
    categoryId: Number.isFinite(categoryId) && categoryId! > 0 ? categoryId : undefined,
    categorySlug,
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs! > 0 ? timeoutMs : undefined,
  });

  if (result.ok) {
    return NextResponse.json(result);
  }

  const status = result.error.status ?? 502;
  return NextResponse.json(result, { status });
}

