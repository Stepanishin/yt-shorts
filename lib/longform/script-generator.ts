export interface ScriptScene {
  sceneNumber: number;
  narrationText: string;
  imageSearchQuery: string;
  mood: "nostalgic" | "triumphant" | "dramatic" | "tragic" | "romantic" | "hopeful" | "dark";
  estimatedSeconds: number;
}

export interface LongformScript {
  celebrityName: string;
  videoTitle: string;
  scenes: ScriptScene[];
  totalWordCount: number;
  estimatedDurationMinutes: number;
}

/**
 * Generate a full biographical script for a long-form video (5-8 minutes).
 * GPT-5 uses its own knowledge — no external research needed.
 */
export async function generateScript(
  celebrityName: string,
  context?: string // optional: what the viral Short was about
): Promise<LongformScript> {
  console.log(`📜 Generating script for: ${celebrityName}...`);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Genera un guión completo para un video biográfico de YouTube (5-8 minutos) sobre ${celebrityName}.
${context ? `\nContexto adicional (de un Short viral): ${context}` : ""}

OBJETIVO: Contar la historia de vida de ${celebrityName} como si fuera una INVESTIGACIÓN PERIODÍSTICA de prensa del corazón. Enfocarse en ESCÁNDALOS, SECRETOS, CONFLICTOS, TRAGEDIAS, TRAICIONES y DRAMAS FAMILIARES. El espectador debe quedarse enganchado porque quiere saber MÁS detalles oscuros y secretos ocultos. Estilo: mezcla de documental de crímenes + prensa amarilla española.

ESTRUCTURA: Devuelve un JSON con exactamente este formato (sin markdown, sin backticks):

{
  "celebrityName": "${celebrityName}",
  "videoTitle": "[Título sensacionalista tipo prensa amarilla, con gancho de curiosidad. NO usar 'La historia completa de'. Ejemplos: 'Lo que NADIE sabe de...', 'El secreto más oscuro de...', 'La verdad oculta de...']",
  "scenes": [
    {
      "sceneNumber": 1,
      "narrationText": "[Texto de narración para esta escena. 2-4 frases. Lenguaje cinematográfico. ESPAÑOL DE ESPAÑA.]",
      "imageSearchQuery": "[Búsqueda específica para encontrar foto relevante de esta época/momento]",
      "mood": "[nostalgic|triumphant|dramatic|tragic|romantic|hopeful|dark]",
      "estimatedSeconds": 35
    }
  ]
}

REQUISITOS DEL GUIÓN:
- Entre 10 y 14 escenas
- Duración total estimada: 5-8 minutos de narración hablada
- MÍNIMO 1000 palabras de narración total. NUNCA menos de 1000 palabras.
- Cada escena: 35-55 segundos de narración (80-120 palabras por escena)
- SOLO hechos ampliamente conocidos y verificables — NO inventar fechas ni eventos
- Narrativa cronológica: infancia → carrera → momentos clave → actualidad/legado
- Tono: como un documental emotivo de televisión española
- Frases CORTAS y CONTUNDENTES. Una idea por frase.
- TODO el texto DEBE estar 100% en ESPAÑOL DE ESPAÑA. NUNCA usar palabras en inglés.
- Los nombres propios extranjeros se escriben TAL CUAL pero se pronuncian en español. NO añadir explicaciones en inglés.
- NUNCA usar expresiones como "breaking news", "show", "reality show" — usar "programa", "concurso", "espectáculo"
- Si el famoso es extranjero, contar su historia SIEMPRE en español, refiriéndose a lugares y eventos con sus nombres en español cuando existan (Nueva York, no New York; Londres, no London)
- Incluir datos concretos: años, lugares, nombres de canciones/películas/programas
- La última escena debe ser un cierre emotivo con reflexión

ESCENA 1 siempre: HOOK IMPACTANTE — una pregunta retórica o revelación que OBLIGUE al espectador a seguir viendo. Ejemplo: "¿Sabías que esta mujer que ves sonriendo en televisión... esconde un secreto que destruyó a su propia familia?" o "Lo que voy a contarte sobre esta persona cambiará todo lo que creías saber." NUNCA empezar con "Nació en..."
ESCENA 2-3: Orígenes — pero enfocado en CONFLICTOS de infancia, pobreza, problemas familiares, secretos de la familia
ESCENA 4-5: Ascenso a la fama — pero con el PRECIO que pagó: sacrificios, enemigos, traiciones
ESCENA 6-8: ESCÁNDALOS Y DRAMAS — esta es la PARTE CENTRAL del video. Desarrollar con MÁXIMO DETALLE: juicios, infidelidades, peleas públicas, dinero, mentiras, adicciones, conflictos familiares. Usar citas textuales reales cuando sea posible.
ESCENA 9-10: Más secretos y giros — lo que nadie sabe, lo que se ocultó, las consecuencias
ESCENA 11-12: Situación actual — pero con tono de "¿qué pasará ahora?" dejando intriga
ESCENA 13-14: Cierre con pregunta al espectador: "¿Tú qué opinas? ¿Crees que merece el perdón?"

TONO GENERAL: Como si estuvieras revelando secretos prohibidos. Usar frases como "Lo que nadie te contó...", "El detalle que todos pasaron por alto...", "La verdad es mucho más oscura de lo que parece..."

IMPORTANTE: Cada escena debe tener MÍNIMO 80 palabras de narración. Si una escena tiene menos, AÑADE más detalles de conflictos, citas, datos concretos. El texto debe ser RICO en detalles escandalosos para que la narración dure al menos 35 segundos por escena.

Para imageSearchQuery: usar nombre completo + época + lugar + evento específico. Ejemplo: "Isabel Pantoja boda Paquirri 1983"

Devuelve SOLO el JSON válido.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      {
        role: "system",
        content:
          "Eres un periodista de investigación de prensa del corazón española, especializado en revelar secretos y escándalos de famosos. Tu estilo mezcla el morbo de Sálvame con la profundidad de un documental de crímenes. Conoces TODOS los escándalos, juicios, infidelidades y secretos de los famosos españoles. SIEMPRE respondes en JSON válido sin markdown.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    // GPT-5 only supports default temperature
  });

  const raw = response.choices[0]?.message?.content?.trim() || "";
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse script JSON:", raw.substring(0, 500));
    throw new Error("GPT returned invalid JSON for script generation");
  }

  const scenes: ScriptScene[] = (parsed.scenes || []).map((s: any) => ({
    sceneNumber: Number(s.sceneNumber),
    narrationText: String(s.narrationText),
    imageSearchQuery: String(s.imageSearchQuery),
    mood: s.mood || "dramatic",
    estimatedSeconds: Number(s.estimatedSeconds) || 35,
  }));

  const totalWordCount = scenes.reduce(
    (sum, s) => sum + s.narrationText.split(/\s+/).length,
    0
  );

  const script: LongformScript = {
    celebrityName: parsed.celebrityName || celebrityName,
    videoTitle: parsed.videoTitle || `La historia completa de ${celebrityName}`,
    scenes,
    totalWordCount,
    estimatedDurationMinutes: Math.round(totalWordCount / 150), // ~150 words/min in Spanish
  };

  console.log(`✅ Script generated: ${scenes.length} scenes, ~${totalWordCount} words, ~${script.estimatedDurationMinutes} min`);

  return script;
}
