import { NextResponse } from "next/server";

import { fetchChistesRandomJoke } from "@/lib/sources/chistes";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Endpoint disabled in production" }, { status: 404 });
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint") || undefined;
  const timeoutParam = url.searchParams.get("timeoutMs");
  const timeoutMs = timeoutParam ? Number(timeoutParam) : undefined;

  const result = await fetchChistesRandomJoke({
    endpoint,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
  });

  if (result.ok) {
    return NextResponse.json(result);
  }

  const status = result.error.status ?? 502;
  return NextResponse.json(
    {
      ok: false,
      error: {
        message: result.error.message,
        endpoint: result.error.endpoint,
        status,
      },
    },
    { status }
  );
}

