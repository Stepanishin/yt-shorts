/**
 * AI-powered news scorer that evaluates viral potential
 * based on analytics patterns from the "Brillo Latino" channel.
 *
 * Key findings from channel data (459 videos, May-Jul 2026, avg 16.7K views, median 11K):
 * - Spanish TV/music/politics personality + love confession or illness = 100K-145K views
 * - Spanish football families, Spanish celebs + revelations, British royals secrets = 50-100K
 * - Foreign celebrities without Spain connection = <1.5K views
 * - Routine events of big names (documentaries, reappearances, back to work) = <1.5K views
 * - Repeated person/topic within a few days = flops (Leonor twice in 3 days: 441 and 431 views)
 */

// Minimum score (1-10) required to publish. Single source of truth,
// imported by news-selector.
export const MIN_SCORE_THRESHOLD = 6;

export interface NewsScore {
  score: number; // 1-10 (10 = highest viral potential)
  reason: string;
  shouldPublish: boolean;
}

/**
 * Score a news item for viral potential using GPT
 * @param recentTitles - Titles of videos published in the last days, used to penalize repeated topics
 * Returns score 1-10 and whether it should be published
 */
export async function scoreNewsCandidate(
  title: string,
  summary: string,
  recentTitles: string[] = []
): Promise<NewsScore> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const recentBlock = recentTitles.length
      ? `
NOTICIAS YA PUBLICADAS EN LOS ÚLTIMOS DÍAS (evita repeticiones):
${recentTitles.slice(0, 40).map((t) => `- ${t}`).join("\n")}

REGLA ANTI-REPETICIÓN:
Si la noticia trata de la MISMA persona o el MISMO evento que alguna de las publicadas arriba, RESTA 3 puntos a tu score, salvo que haya un giro nuevo realmente importante (muerte, ruptura confirmada, escándalo nuevo). Los datos del canal muestran que repetir protagonista en pocos días hunde las views (ej: dos videos de Leonor en 3 días: 441 y 431 views).
`
      : "";

    const prompt = `Eres un analista de datos de un canal de YouTube Shorts de noticias de famosos en España llamado "Brillo Latino". Tu trabajo es predecir el potencial viral de cada noticia ANTES de crear el video.

DATOS REALES del canal (últimos 459 videos, mayo-julio 2026, media 16.7K views, mediana 11K):

Videos TOP (50K-145K views):
- "Albert Rivera CONFIESA RELACIONES CON MALÚ Y MARIONA" — 145K (político español + confesión amorosa)
- "Carme Chaparro DECLARA SU AMOR EN PLENA ENFERMEDAD" — 111K (presentadora española + amor + enfermedad)
- "Xabi Alonso HIJAS ROBAN PROTAGONISMO EN MENORCA" — 97K (familia de futbolista español)
- "María Hervás CONFIESA FLECHAZO CON REINA LETIZIA" — 96K (actriz española + realeza)
- "Carlos III ENCUENTRO SECRETO CON HARRY" — 72K (realeza británica + secreto)
- "Guillermo de Gales REVELA CHARLA PENDIENTE CON CHARLOTTE" — 64K (realeza británica + familia)
- "Fernando Sanz BODA EN LA MISMA IGLESIA" — 63K (boda + fútbol español)
- "Lamine Yamal NOVIA LE PIDE LO QUE SEA" — 58K (futbolista español + pareja)

Videos FLOP (<1.5K views):
- "Inger Nilsson PIPPI REGRESA EN NUEVA VERSIÓN" — 1.3K (extranjera sin conexión con España)
- "Rafa Nadal ESTRENA DOCUMENTAL CON SU FAMILIA" — 1.2K (nombre grande pero evento rutinario/promocional)
- "Alberto de Mónaco SUPERVISA INVESTIGACIÓN" — 1.1K (institucional, sin emoción)
- "Kate Middleton CITA SECRETA CON TAYLOR Y TRAVIS" — 632 (mezcla con celebrities americanas no funciona)
- "Grizz Chapman FALLECE EL GIGANTE DE 30 ROCK" — 435 (actor extranjero desconocido en España)
- "Úrsula Corberó VUELVE AL TRABAJO" — 148 (evento rutinario sin historia)

REGLAS DE SCORING:
- 9-10: Famoso español TOP (TV, música, política, fútbol) + drama personal fuerte y NUEVO (confesión amorosa, enfermedad, muerte, ruptura, escándalo, hijos)
- 7-8: Realeza británica o española con secreto/conflicto/emoción, O famoso español conocido + tema emocional, O boda/embarazo de famoso español
- 5-6: Famoso español medio con historia publicable pero sin gancho fuerte
- 3-4: Evento RUTINARIO o PROMOCIONAL de un nombre grande (estreno, documental, reaparición, vuelta al trabajo, cumpleaños), O famoso internacional poco vinculado a España
- 1-2: Persona desconocida, O extranjero sin conexión con España, O tema institucional/aburrido

IMPORTANTE: el tamaño del nombre NO basta. "Rafa Nadal estrena documental" = 3 puntos (rutinario). Lo que dispara views es la EMOCIÓN PERSONAL: amor, enfermedad, muerte, ruptura, secreto, familia.
${recentBlock}
Noticia a evaluar:
Título: ${title}
Resumen: ${summary}

Responde SOLO con este formato JSON exacto (sin markdown, sin backticks):
{"score": X, "reason": "explicación corta en español"}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un analista de datos especializado en YouTube Shorts de noticias de famosos españoles. Respondes SOLO en JSON válido.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content?.trim() || "";
    // Clean potential markdown wrapping
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const score = Math.min(10, Math.max(1, Number(parsed.score) || 1));
    const reason = String(parsed.reason || "Sin razón");

    return {
      score,
      reason,
      shouldPublish: score >= MIN_SCORE_THRESHOLD,
    };
  } catch (error) {
    console.error("Failed to score news:", error);
    // On error, allow publishing (don't block pipeline)
    return {
      score: MIN_SCORE_THRESHOLD,
      reason: "Error en scoring, publicando por defecto",
      shouldPublish: true,
    };
  }
}
