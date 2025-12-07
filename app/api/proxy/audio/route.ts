import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/proxy/audio?url=<encoded_audio_url>
 * Проксирует аудио файлы для обхода CORS ограничений
 * Поддерживает Range requests для перемотки (seek)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const audioUrl = searchParams.get("url");

    if (!audioUrl) {
      return NextResponse.json(
        { error: "Audio URL is required" },
        { status: 400 }
      );
    }

    console.log("Proxying audio from (original):", audioUrl);

    // Получаем Range заголовок из запроса браузера
    const rangeHeader = request.headers.get("range");
    console.log("Range header from browser:", rangeHeader);

    // Формируем заголовки для внешнего запроса
    const fetchHeaders: HeadersInit = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    // Передаем Range заголовок, если он есть
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    // Сначала пробуем загрузить оригинальный URL как есть
    let response = await fetch(audioUrl, { headers: fetchHeaders });

    // Если не получилось, пробуем декодировать URL
    if (!response.ok && response.status === 404) {
      console.log("404 with original URL, trying decoded version...");
      const decodedUrl = decodeURIComponent(audioUrl);
      console.log("Trying decoded URL:", decodedUrl);

      response = await fetch(decodedUrl, { headers: fetchHeaders });
    }

    if (!response.ok) {
      console.error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch audio: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Получаем содержимое как ArrayBuffer
    const audioBuffer = await response.arrayBuffer();

    // Определяем content-type
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const contentLength = response.headers.get("content-length");
    const contentRange = response.headers.get("content-range");

    console.log("Response headers:", {
      contentType,
      contentLength,
      contentRange,
      status: response.status,
    });

    // Формируем заголовки ответа
    const responseHeaders: HeadersInit = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Accept-Ranges": "bytes", // КРИТИЧНО: указываем, что поддерживаем Range requests
    };

    // Добавляем Content-Length если есть
    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    // Добавляем Content-Range если есть (для Range requests)
    if (contentRange) {
      responseHeaders["Content-Range"] = contentRange;
    }

    // Возвращаем правильный статус код
    const statusCode = response.status === 206 ? 206 : 200;

    return new NextResponse(audioBuffer, {
      status: statusCode,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Error proxying audio:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to proxy audio",
      },
      { status: 500 }
    );
  }
}

// Обработка OPTIONS запроса для CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Accept-Ranges": "bytes",
    },
  });
}
