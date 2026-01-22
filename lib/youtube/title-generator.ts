import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Генерирует привлекательное название для YouTube Shorts
 * на основе текста анекдота
 */
export async function generateShortsTitle(jokeText: string, jokeTitle?: string): Promise<string> {
  try {
    const prompt = `Создай короткое, привлекательное название для YouTube Shorts с испанским анекдотом.

Анекдот: ${jokeText}
${jokeTitle ? `Оригинальное название: ${jokeTitle}` : ""}

Требования:
- На испанском языке
- Максимум 60 символов
- Цепляющее и интригующее
- Использовать эмодзи (1-2)
- БЕЗ хэштегов (они добавятся отдельно)
- Должно вызывать желание посмотреть

Примеры хороших названий:
- "¡No vas a creer esto! 😂"
- "El mejor chiste del día 🤣"
- "Esto me hizo llorar de risa 😭"

Верни ТОЛЬКО название, без кавычек и пояснений.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un experto en crear títulos virales para YouTube Shorts de comedia en español.",
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

    // Обрезаем если слишком длинное
    return title.length > 60 ? title.substring(0, 57) + "..." : title;
  } catch (error) {
    console.error("Failed to generate title:", error);
    // Fallback к простому названию
    return jokeTitle || "Chiste del día 😂";
  }
}

/**
 * Генерирует оптимизированное описание для YouTube Shorts
 */
export async function generateShortsDescription(jokeText: string): Promise<string> {
  try {
    const prompt = `Создай привлекательное описание для YouTube Shorts с этим анекдотом:

"${jokeText}"

Требования:
- На испанском языке
- Первая строка - краткая версия анекдота или интригующее вступление
- Призыв к действию (подписаться, поставить лайк)
- Релевантные хэштеги на испанском
- Максимум 500 символов

Формат:
[Краткое описание/интрига]

🎭 [Призыв к действию]
😂 [Дополнительный призыв]

#Хэштеги #Релевантные #Испанские

Верни ТОЛЬКО текст описания без дополнительных пояснений.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un experto en marketing de contenido para YouTube Shorts en español.",
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
    console.error("Failed to generate description:", error);
    // Fallback к простому описанию
    return `${jokeText}

🎭 Chistes en Español | Humor Latino
😂 Síguenos para más risas diarias

#Shorts #Chistes #Humor #Comedia`;
  }
}

// ============================================
// NEWS-SPECIFIC TITLE AND DESCRIPTION GENERATORS
// ============================================

/**
 * Генерирует привлекательное название для YouTube Shorts с новостями
 * Формат: 😱Nombre Apellido (edad) EVENTO EN CAPS (año) #UltimaHora #España
 */
export async function generateNewsShortsTitle(newsTitle: string, newsSummary: string): Promise<string> {
  const currentYear = new Date().getFullYear();

  try {
    const prompt = `Crea un título para YouTube Shorts con esta noticia de prensa del corazón española.

Título original: ${newsTitle}
Resumen: ${newsSummary}

FORMATO OBLIGATORIO:
[emoji][Nombre Apellido] ([edad]) [EVENTO EN MAYÚSCULAS] (${currentYear}) #UltimaHora #España

REQUISITOS:
- Empezar con emoji dramático: 😱💔🔥😢⚠️❌💥
- Nombre completo del famoso/a
- Edad entre paréntesis si se conoce o se puede deducir
- Evento principal en MAYÚSCULAS (máximo 5-6 palabras)
- Año actual (${currentYear})
- Terminar con #UltimaHora #España
- Máximo 90 caracteres en total

EJEMPLOS EXACTOS del formato:
- 😱Carmen Lomana (77) ICTUS GRAVE EN SU MANSIÓN (${currentYear}) #UltimaHora #España
- 😱Julia Otero (66) LLORA AL CONFIRMAR SU SALUD (${currentYear}) #UltimaHora #España
- 💔Ana Obregón (69) RUPTURA TOTAL CON SU FAMILIA (${currentYear}) #UltimaHora #España
- 🔥Tamara Falcó (42) ESCÁNDALO EN SU BODA (${currentYear}) #UltimaHora #España
- 😢Isabel Pantoja (68) INGRESADA DE URGENCIA (${currentYear}) #UltimaHora #España

Si no conoces la edad exacta, usa una edad aproximada razonable para el famoso.

Devuelve SOLO el título en el formato exacto, sin explicaciones.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un experto en crear títulos virales para YouTube Shorts de noticias de famosos y prensa del corazón española. Conoces las edades aproximadas de los famosos españoles. Sigues el formato exacto que te piden.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 120,
    });

    const title = response.choices[0]?.message?.content?.trim();

    if (!title) {
      throw new Error("No title generated");
    }

    return title;
  } catch (error) {
    console.error("Failed to generate news title:", error);
    // Fallback с formato básico
    return `😱${newsTitle.substring(0, 50)} (${currentYear}) #UltimaHora #España`;
  }
}

/**
 * Генерирует оптимизированное описание для YouTube Shorts с новостями
 * Стиль: очень драматичный, детальный, сенсационный, с интерактивом
 */
export async function generateNewsShortsDescription(newsTitle: string, newsSummary: string): Promise<string> {
  try {
    const prompt = `Crea una descripción MUY DRAMÁTICA y DETALLADA para YouTube Shorts con esta noticia de prensa del corazón española.

Título: ${newsTitle}
Resumen: ${newsSummary}

REQUISITOS ESTRICTOS:
- En español de España
- Estilo de revista del corazón sensacionalista (¡Hola!, Diez Minutos, Lecturas)
- Tono MUY dramático, emotivo, casi cinematográfico
- MÍNIMO 800 caracteres de descripción

ESTRUCTURA OBLIGATORIA:

1. TITULAR DRAMÁTICO EN MAYÚSCULAS (terminar con punto)
   Ejemplo: "CONMOCIÓN EN LA RADIO: JULIA OTERO ROMPE A LLORAR EN DIRECTO."

2. PRIMER PÁRRAFO - Contexto dramático:
   - Describir la situación con detalles impactantes
   - Mencionar el nombre completo y profesión/título del famoso
   - Incluir detalles específicos (lugar, circunstancias, reacciones)
   - Usar lenguaje emotivo y dramático
   - 3-4 frases mínimo

3. SEGUNDO PÁRRAFO - Reflexión y preguntas:
   - Análisis emocional de la situación
   - Referencia a su vida/carrera/luchas anteriores
   - Mínimo 2-3 preguntas retóricas para generar intriga
   - Mencionar la reacción del público/España
   - "Toda España se vuelca con...", "¿Qué pasará ahora?", etc.
   - 3-4 frases mínimo

4. LLAMADA A LA ACCIÓN INTERACTIVA:
   👇 [PALABRA EN CAPS]: Envía un emoji de "[emoji]" o un corazón para [acción emotiva relacionada con la noticia].

   Ejemplos:
   - 👇 APOYO: Envía un emoji de "💪" o un corazón para decirle a Julia que no está sola en esta batalla.
   - 👇 FUERZA: Escribe "❤️" para enviarle todo tu cariño en este momento tan difícil.
   - 👇 ÁNIMO: Deja un "🙏" para que se recupere pronto.

5. HASHTAGS (mínimo 15):
   - #NombreCompleto #SoloApellido
   - Hashtags de su profesión/ámbito (#Radio, #Television, #Moda, etc.)
   - #TemaDeLaNoticia (#Cancer, #Salud, #Ruptura, #Escandalo, etc.)
   - Conceptos emotivos (#Lucha, #Superacion, #Drama, #Emotivo)
   - #UltimaHora #España #Noticias #Viral
   - Hashtag único de apoyo (#Fuerza[Nombre], #Animo[Nombre])

EJEMPLO COMPLETO:
CONMOCIÓN EN LA RADIO: JULIA OTERO ROMPE A LLORAR EN DIRECTO.

La periodista más respetada de España, Julia Otero, ha paralizado su programa tras recibir una noticia médica de última hora. El miedo a una recaída en el cáncer ha vuelto a golpear a la comunicadora, que no ha podido contener las lágrimas ante sus oyentes. Un momento de vulnerabilidad extrema que demuestra que, detrás del micrófono, hay una mujer luchadora pero humana.

¿Qué dicen los médicos? ¿Volverá a retirarse de las ondas? Toda España se vuelca con Julia en estas horas críticas. Escucha sus emotivas palabras y la reacción de sus compañeros de profesión. La lucha contra el cáncer tiene un nuevo capítulo.

👇 APOYO: Envía un emoji de "💪" o un corazón para decirle a Julia que no está sola en esta batalla.

#JuliaOtero #OndaCero #Radio #Cancer #LuchaContraElCancer #Salud #Periodismo #Superacion #Mujer #UltimaHora #España #Noticias #Emotivo #Viral #FuerzaJulia

Devuelve SOLO la descripción completa siguiendo EXACTAMENTE este formato, sin explicaciones adicionales.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres el mejor redactor de prensa del corazón de España. Trabajas para ¡Hola!, Lecturas y Diez Minutos. Tu especialidad es crear descripciones LARGAS, DRAMÁTICAS y EMOTIVAS que enganchan al lector desde la primera palabra. Conoces a todos los famosos españoles, sus historias, luchas y dramas. Escribes como si cada noticia fuera el capítulo más importante de una telenovela.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.85,
      max_tokens: 800,
    });

    const description = response.choices[0]?.message?.content?.trim();

    if (!description) {
      throw new Error("No description generated");
    }

    return description;
  } catch (error) {
    console.error("Failed to generate news description:", error);
    // Fallback
    return `ÚLTIMA HORA: ${newsTitle}

${newsSummary}

¿Qué pasará ahora? Toda España pendiente de esta noticia.

👇 APOYO: Envía un "❤️" para mostrar tu apoyo.

#Famosos #Noticias #España #UltimaHora #Viral #Exclusiva #Drama #Emotivo`;
  }
}
