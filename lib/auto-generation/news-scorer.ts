/**
 * AI-powered news scorer that evaluates viral potential
 * based on analytics patterns from the "Brillo Latino" channel.
 *
 * Key findings, updated 2026-08-24 (207 videos, Jul 25 - Aug 22, median 15K):
 * - Audience skews older Spanish: classic TV/cinema/flamenco names win big
 *   (Manolo Solo 175K avg, Blanca Romero 91K, Pepe Habichuela 65K)
 * - LATAM megastars FLOP despite fame (Messi 6K avg over 4 videos, Shakira 15K)
 * - Young influencers/reality stars flop (Julia Janeiro 7K, Steisy 9K, Lucía Pombo 9K)
 * - Repeated person within days dilutes results (Paula Echevarría 12 videos/month)
 * - Freshness matters: channel brands itself #UltimaHora
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
  recentTitles: string[] = [],
  newsAgeHours?: number,
  trendingPersons: string[] = []
): Promise<NewsScore> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const trendingBlock = trendingPersons.length
      ? `
PERSONAS EN TENDENCIA (tienen un video VIRAL en el canal en las últimas 48 horas):
${trendingPersons.map((p) => `- ${p}`).join("\n")}

REGLA DE SEGUIMIENTO DE ÉXITOS: si la noticia aporta información NUEVA sobre una de estas personas, SÚMALE 2 puntos y NO apliques las reglas anti-repetición (el algoritmo ya encontró audiencia para esa persona: la serie sobre el rey Harald hizo 5 videos seguidos de 286-310K). Límite: si esa persona ya aparece 3 o más veces en la lista de publicadas, vuelve a las reglas normales. Una noticia SIN información nueva (refrito de lo mismo) no recibe el bono.
`
      : "";

    const recentBlock = recentTitles.length
      ? `
NOTICIAS YA PUBLICADAS EN LOS ÚLTIMOS 7 DÍAS (evita repeticiones):
${recentTitles.slice(0, 40).map((t) => `- ${t}`).join("\n")}

REGLAS ANTI-REPETICIÓN (estrictas):
- Si la persona protagonista ya aparece 1 vez en la lista: RESTA 3 puntos, salvo giro nuevo realmente importante (muerte, ruptura confirmada, escándalo nuevo).
- Si la persona protagonista ya aparece 2 O MÁS veces en la lista: score MÁXIMO 4. Los datos del canal muestran que saturar con una persona diluye las views (Paula Echevarría: 12 videos en un mes).
- EXCEPCIÓN MEGAEVENTO: si se trata de un megaevento en desarrollo (muerte de un monarca, sucesión al trono, funeral de Estado, boda real), los seguimientos con información NUEVA están permitidos durante los primeros 2-3 días sin penalización. La muerte del rey Harald de Noruega generó 5 videos seguidos de 100-310K views cada uno. Pasados 3 días del evento, aplica el anti-repetición normal.
`
      : "";

    const ageBlock = newsAgeHours !== undefined
      ? `
ANTIGÜEDAD DE LA NOTICIA: ${Math.round(newsAgeHours)} horas.
REGLA DE FRESCURA: el canal se presenta como #UltimaHora. Si la noticia tiene más de 48 horas, RESTA 2 puntos, salvo tema atemporal (aniversarios, secretos del pasado, historia). Menos de 12 horas: es un punto a favor.
`
      : "";

    const prompt = `Eres un analista de datos de un canal de YouTube Shorts de noticias de famosos en España llamado "Brillo Latino". Tu trabajo es predecir el potencial viral de cada noticia ANTES de crear el video.

PERFIL DE AUDIENCIA (clave): española, mayor de 45 años, ve televisión tradicional. Le interesan los rostros clásicos de la TV, el cine, la copla y el flamenco español. NO le interesan las estrellas latinoamericanas globales ni los influencers jóvenes.

DATOS REALES del canal (207 videos, julio-agosto 2026, mediana 15K views):

Personas TOP (media de views por video):
- Manolo Solo (actor de cine español) — 175K
- Blanca Romero (actriz/modelo española) — 91K
- Pepe Habichuela (guitarrista flamenco) — 65K
- Alejandro Sanz (cantante español clásico) — 46K
- Fabiola Martínez (ex de Bertín Osborne) — 45K
- David Bustamante, Juan Tamariz — 39-42K

Personas FLOP (a pesar de ser famosísimas):
- Leo Messi — 6K de media en 4 videos (deporte LATAM no funciona)
- Julia Janeiro, Steisy, Lucía Pombo (influencers/reality jóvenes) — 7-9K
- Cari Lapique — 8K
- Shakira — 15K (estrella LATAM global, no funciona)
- Sara Carbonero — 14K

REGLAS DE SCORING:
- 9-10: Rostro clásico español (TV, cine, música, copla, flamenco, toreo) + drama personal fuerte y NUEVO (confesión amorosa, enfermedad, muerte, ruptura, escándalo, hijos), O MEGAEVENTO de realeza EUROPEA aunque sea extranjera: muerte de un monarca, sucesión al trono, abdicación, boda real, funeral de Estado (datos reales: muerte del rey Harald de Noruega — 286K, la reina Sonia viuda — 310K, el nuevo rey Haakon — 286K)
- 7-8: Famoso español conocido + tema emocional, O realeza española/europea con ESCÁNDALO, salud grave, ruptura o conflicto familiar REAL (dato: Juan Carlos reencuentro polémico en Marivent — 200K), O boda/embarazo/muerte de famoso español
- 5-6: Famoso español medio con historia publicable pero sin gancho fuerte
- 3-4: RUTINA de la realeza ESPAÑOLA (agenda oficial, looks y vestidos, actos protocolarios, viajes, vacaciones, entregas de premios — dato real: la rutina de Letizia hace 9K de mediana en 10 videos y Leonor 6K en 9, la mitad de la media del canal), O estrella LATAM o internacional NO real (aunque sea enorme: Messi, Shakira), O influencer/reality joven, O evento RUTINARIO de realeza extranjera, O evento RUTINARIO/PROMOCIONAL de un nombre grande (estreno, documental, reaparición, cumpleaños)
- 1-2: Persona desconocida, O extranjero sin conexión con España ni corona europea, O tema institucional/aburrido

TIPO DE HECHO (aplícalo a cualquier tema):
- El núcleo de la noticia es un HECHO DURO — anuncia algo, hospitalización, muerte, ruptura, demanda, confesión: súmale 1 punto (datos: ANUNCIA 29K, HOSPITAL 25K, MUERTE 26K de mediana).
- El núcleo es BLANDO — confirma rumores, asiste, reaparece, posa, luce un look: réstale 1 punto (dato: CONFIRMA 12K de mediana).

IMPORTANTE: el tamaño del nombre NO basta. Messi tiene 500M seguidores y hace 6K views en este canal. Lo que dispara views es: rostro conocido POR LA AUDIENCIA ESPAÑOLA MAYOR + EMOCIÓN PERSONAL (amor, enfermedad, muerte, ruptura, secreto, familia). La única excepción son los MEGAEVENTOS de coronas europeas: muerte, sucesión, boda real — eso lo ve toda la audiencia aunque el monarca sea extranjero. Ojo: la agenda rutinaria de esas mismas coronas extranjeras sigue siendo 3-4.
${recentBlock}${trendingBlock}${ageBlock}
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
