import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a viral Spanish title for a meme YouTube Shorts
 */
export async function generateMemeShortsTitle(memeTitle: string): Promise<string> {
  try {
    const prompt = `Crea un título viral para YouTube Shorts con este meme.

Título original del meme: ${memeTitle}

REQUISITOS:
- Máximo 60 caracteres
- 1-2 emojis de risa/reacción (😂🤣💀😭🔥)
- Sin hashtags
- En ESPAÑOL
- Estilo viral de TikTok/Shorts
- Debe hacer que la gente quiera ver el video

EJEMPLOS del estilo deseado:
- "Este meme me DESTRUYÓ 💀😭"
- "No puedo dejar de reírme 🤣🤣"
- "POV: Cuando tu mamá te llama... 😂"
- "El meme más real que verás hoy 🔥"
- "JAJAJA esto es MUY yo 💀"

Devuelve SOLO el título, sin comillas ni explicaciones.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un experto en crear títulos virales para YouTube Shorts de memes en español. Conoces las tendencias de TikTok y YouTube.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.9,
      max_tokens: 100,
    });

    const title = response.choices[0]?.message?.content?.trim();

    if (!title) {
      throw new Error("No title generated");
    }

    // Trim if too long
    return title.length > 60 ? title.substring(0, 57) + "..." : title;
  } catch (error) {
    console.error("Failed to generate meme title:", error);
    // Fallback to simple title
    return "Este meme es IMPECABLE 😂🔥";
  }
}

/**
 * Generate an optimized Spanish description for a meme YouTube Shorts
 */
export async function generateMemeShortsDescription(
  memeTitle: string,
  subreddit?: string
): Promise<string> {
  try {
    const prompt = `Crea una descripción atractiva para YouTube Shorts con este meme.

Título del meme: ${memeTitle}
${subreddit ? `Fuente: Reddit r/${subreddit}` : ""}

REQUISITOS:
- En ESPAÑOL
- Primera línea: frase corta y llamativa
- Incluir llamada a la acción (suscribirse, dar like)
- Hashtags relevantes para memes en español
- Máximo 500 caracteres

FORMATO:
[Frase llamativa sobre el meme]

😂 ¡Dale like si te identificas!
🔔 Suscríbete para más memes diarios

#hashtags #relevantes

Devuelve SOLO la descripción sin explicaciones adicionales.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un experto en marketing de contenido para YouTube Shorts de memes en español.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const description = response.choices[0]?.message?.content?.trim();

    if (!description) {
      throw new Error("No description generated");
    }

    return description;
  } catch (error) {
    console.error("Failed to generate meme description:", error);
    // Fallback description
    return `${memeTitle}

😂 ¡Dale like si te identificas!
🔔 Suscríbete para más memes diarios

#shorts #meme #memes #humor #viral #risa #gracioso #divertido #comedia #funny`;
  }
}
