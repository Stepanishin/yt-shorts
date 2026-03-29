/**
 * Generate dynamic YouTube tags for news videos.
 * Extracts celebrity names, topics, and relevant keywords
 * to maximize search discoverability.
 */

const BASE_TAGS = [
  "noticias",
  "famosos",
  "españa",
  "shorts",
  "viral",
  "ultimahora",
  "prensa del corazon",
];

/**
 * Generate dynamic tags from news title and summary using GPT
 */
export async function generateNewsTags(
  title: string,
  summary: string,
  configTags?: string[]
): Promise<string[]> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Extraes tags de YouTube de noticias de famosos. Respondes SOLO con un JSON array de strings.",
        },
        {
          role: "user",
          content: `Extrae tags de YouTube de esta noticia española.

Título: ${title}
Resumen: ${summary}

Devuelve un JSON array con 10-15 tags. Incluye:
- Nombre completo del famoso (ej: "Isabel Pantoja")
- Solo apellido (ej: "Pantoja")
- Solo nombre (ej: "Isabel")
- Profesión (ej: "cantante", "actriz", "presentadora")
- Programa de TV si aplica (ej: "El Hormiguero", "Supervivientes")
- Tema principal (ej: "ruptura", "enfermedad", "boda", "escandalo")
- Familia real si aplica (ej: "casa real", "monarquia")

Solo tags en español, sin # ni mayúsculas. Responde SOLO el JSON array.`,
        },
      ],
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content?.trim() || "[]";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const dynamicTags: string[] = JSON.parse(cleaned);

    // Merge: dynamic + base + config tags, deduplicate
    const allTags = [
      ...dynamicTags.map((t) => t.toLowerCase().trim()),
      ...BASE_TAGS,
      ...(configTags || []).map((t) => t.toLowerCase().trim()),
    ];

    const unique = [...new Set(allTags)].filter((t) => t.length > 0);

    // YouTube allows max 500 chars total for tags, max ~30 tags
    const finalTags: string[] = [];
    let totalLength = 0;
    for (const tag of unique) {
      if (totalLength + tag.length + 1 > 490 || finalTags.length >= 30) break;
      finalTags.push(tag);
      totalLength += tag.length + 1;
    }

    console.log(`🏷️  Generated ${finalTags.length} tags: ${finalTags.join(", ")}`);
    return finalTags;
  } catch (error) {
    console.error("Failed to generate dynamic tags, using defaults:", error);
    return [...BASE_TAGS, ...(configTags || [])];
  }
}
