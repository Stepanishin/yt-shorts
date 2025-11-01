import { NextResponse } from "next/server";

import { fetchYavendrasCategory } from "@/lib/sources/yavendras";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Endpoint disabled in production" }, { status: 404 });
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "chistes";
  const pageParam = url.searchParams.get("page");
  const page = pageParam ? Number(pageParam) : 1;
  const baseUrl = url.searchParams.get("baseUrl") || undefined;
  const timeoutParam = url.searchParams.get("timeoutMs");
  const timeoutMs = timeoutParam ? Number(timeoutParam) : undefined;

  const result = await fetchYavendrasCategory({
    slug,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    baseUrl,
    timeoutMs: timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
  });

  if (result.ok) {
    return NextResponse.json(result);
  }

  const status = result.error.status ?? 502;
  return NextResponse.json(result, { status });
}

