import { NextResponse } from "next/server";

export async function GET() {
  try {
    const url = "https://www.piada.com/busca_piadas.php?categoria=08";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ShortsGeneratorBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Find the position of "nibus" to see what's before it
    const searchText = "nibus";
    const searchBytes = new TextEncoder().encode(searchText);

    let position = -1;
    for (let i = 0; i < bytes.length - searchBytes.length; i++) {
      let match = true;
      for (let j = 0; j < searchBytes.length; j++) {
        if (bytes[i + j] !== searchBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        position = i;
        break;
      }
    }

    let sample = "";
    let bytesHex = "";

    if (position > 0) {
      // Show 20 bytes before "nibus"
      const start = Math.max(0, position - 20);
      const end = Math.min(bytes.length, position + 30);
      const slice = bytes.slice(start, end);

      // Show as hex
      bytesHex = Array.from(slice)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');

      sample = `Bytes around "nibus": ${bytesHex}`;
    }

    // Try different decodings
    const asUtf8 = new TextDecoder('utf-8').decode(buffer);
    const asLatin1 = new TextDecoder('iso-8859-1').decode(buffer);
    const asWindows1252 = new TextDecoder('windows-1252').decode(buffer);

    // Extract sample text
    const extractSample = (text: string) => {
      const match = text.match(/Um velho senta-se[^<]{0,200}/);
      return match ? match[0] : "Not found";
    };

    return NextResponse.json({
      url,
      contentType: response.headers.get('content-type'),
      bytesAnalysis: sample,
      decodings: {
        utf8: extractSample(asUtf8),
        latin1: extractSample(asLatin1),
        windows1252: extractSample(asWindows1252),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
