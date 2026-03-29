/**
 * AI-powered news scorer that evaluates viral potential
 * based on analytics patterns from "España Sin Filtro" channel.
 *
 * Key findings from channel data (294 videos, Feb-Mar 2026):
 * - Spanish TV personalities + family/emotional stories = 100K-274K views
 * - Spanish royalty = consistent 100K+
 * - Foreign/unknown celebrities = <1K views
 * - Boring topics (audiences, hospital discharges) = <500 views
 */

export interface NewsScore {
  score: number; // 1-10 (10 = highest viral potential)
  reason: string;
  shouldPublish: boolean;
}

/**
 * Score a news item for viral potential using GPT
 * Returns score 1-10 and whether it should be published
 */
export async function scoreNewsCandidate(
  title: string,
  summary: string
): Promise<NewsScore> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Eres un analista de datos de un canal de YouTube de noticias de famosos en España llamado "España Sin Filtro". Tu trabajo es predecir el potencial viral de cada noticia ANTES de crear el video.

DATOS REALES del canal (últimos 294 videos):
- Videos con 100K-274K views: famosos españoles de TV (Carlos Lozano, Mariló Montero, David Bustamante), realeza (Reina Sofía, Príncipe Guillermo), historias familiares/emocionales
- Videos con 30K-100K views: famosos españoles conocidos, realeza europea, temas con 2 nombres famosos juntos
- Videos con 5K-30K views: famosos españoles medianos, temas rutinarios
- Videos con <1K views: famosos extranjeros no vinculados a España (Demi Moore, Zendaya, Jessie Buckley), personas desconocidas, temas aburridos (audiencias formales, altas hospitalarias)

REGLAS DE SCORING:
- 9-10: Famoso español TOP (Pantoja, Bustamante, Omar Montes, Julio Iglesias, etc.) + tema emocional fuerte (muerte, enfermedad, escándalo, ruptura, hijo)
- 7-8: Famoso español conocido + tema interesante, O realeza española/europea + drama
- 5-6: Famoso español medio, tema rutinario pero publicable
- 3-4: Famoso internacional poco conocido en España, O tema aburrido
- 1-2: Persona desconocida, O famoso extranjero sin conexión con España, O tema institucional/aburrido

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
      shouldPublish: score >= 5,
    };
  } catch (error) {
    console.error("Failed to score news:", error);
    // On error, allow publishing (don't block pipeline)
    return {
      score: 5,
      reason: "Error en scoring, publicando por defecto",
      shouldPublish: true,
    };
  }
}
