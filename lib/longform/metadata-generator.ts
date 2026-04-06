/**
 * Generate YouTube title, description, and tags for a long-form video.
 */

export interface LongformMetadata {
  title: string;
  description: string;
  tags: string[];
}

export async function generateLongformMetadata(
  celebrityName: string,
  scenes: { sceneNumber: number; narrationText: string; startTime?: number }[],
  videoTitle: string
): Promise<LongformMetadata> {
  console.log(`📝 Generating YouTube metadata for: ${celebrityName}...`);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Generate timestamps for description (chapter markers)
  const chapters = scenes
    .filter((s) => s.startTime !== undefined)
    .map((s) => {
      const mins = Math.floor((s.startTime || 0) / 60);
      const secs = Math.floor((s.startTime || 0) % 60);
      const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;
      const preview = s.narrationText.substring(0, 60).replace(/\n/g, " ");
      return `${timeStr} ${preview}...`;
    })
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Generas metadatos SEO para YouTube en español. Respondes SOLO en JSON válido.",
      },
      {
        role: "user",
        content: `Genera metadatos para un video de YouTube estilo prensa amarilla sobre ${celebrityName}.

Título original: ${videoTitle}

El canal es de prensa del corazón española — estilo sensacionalista, provocativo, que genere curiosidad.

Devuelve JSON:
{
  "title": "título PROVOCATIVO max 70 chars. Debe generar CURIOSIDAD e INTRIGA. Usar fórmulas como: 'Lo que NADIE sabe de [nombre]', '[nombre]: La verdad que OCULTÓ durante años', 'El SECRETO más oscuro de [nombre]', '[nombre] ROMPE el silencio: lo que dijo es DEMOLEDOR'. SIEMPRE incluir el nombre del famoso. NUNCA usar 'La historia completa'.",
  "description": "descripción de 500-800 chars: empezar con pregunta retórica impactante, luego resumen de los escándalos principales, llamada a suscripción",
  "tags": ["array de 15-20 tags: nombre, apellido, escándalo, secreto, verdad, profesión, España, famosos, documental"]
}

Solo JSON, sin markdown.`,
      },
    ],
    temperature: 0.4,
  });

  const raw = response.choices[0]?.message?.content?.trim() || "";
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);

  // Build full description with chapters
  let fullDescription = parsed.description || "";
  if (chapters) {
    fullDescription += `\n\n📌 CAPÍTULOS:\n${chapters}`;
  }
  fullDescription += `\n\n🔔 ¡SUSCRÍBETE para más historias de famosos españoles!\n👍 Dale LIKE si te emocionó esta historia`;
  fullDescription += `\n\n#${celebrityName.replace(/\s+/g, "")} #Biografía #España #Famosos #Documental #Historia`;

  const metadata: LongformMetadata = {
    title: parsed.title || videoTitle,
    description: fullDescription,
    tags: [
      ...(parsed.tags || []),
      celebrityName.toLowerCase(),
      "biografía",
      "documental",
      "españa",
      "famosos",
      "historia completa",
    ].filter((t, i, arr) => arr.indexOf(t) === i), // deduplicate
  };

  console.log(`✅ Metadata generated: "${metadata.title}" (${metadata.tags.length} tags)`);

  return metadata;
}
