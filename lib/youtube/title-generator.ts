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
    const prompt = `Crea un título en DOS LÍNEAS para YouTube Shorts con esta noticia de prensa del corazón española.

Título original: ${newsTitle}
Resumen: ${newsSummary}

FORMATO OBLIGATORIO:
Línea 1: ¡[GANCHO EMOCIONAL O REVELACIÓN IMPACTANTE]!
Línea 2: [CONTEXTO O MISTERIO QUE GENERA INTRIGA]

REQUISITOS:
- Dos líneas separadas por salto de línea
- Sin emojis
- Sin palabras vacías: nada de "BOMBAZO", "EXCLUSIVA", "REVELACIÓN", "INCREÍBLE"
- El drama viene de los HECHOS, no de adjetivos
- Línea 1: impacto directo, termina con !
- Línea 2: consecuencia, misterio o ironía de la historia
- Máximo 90 caracteres en total

EJEMPLOS EXACTOS del formato:
- ¡LA HIJA DEL ASESINO DE LORCA!\nEL SECRETO QUE LA PERSIGUIÓ HASTA LA TUMBA
- ¡NO PUDO VIVIR SIN ELLA!\nLA TRAGEDIA QUE MATÓ A MADRE E HIJO EN 15 DÍAS
- ¡MURIÓ SIN SABER LA VERDAD!\nEL ENGAÑO QUE DESTRUYÓ SU FAMILIA
- ¡SE FUE SIN DESPEDIRSE!\nLA ÚLTIMA LLAMADA QUE NADIE CONTESTÓ

Devuelve SOLO el título en dos líneas, sin explicaciones.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un experto en crear títulos virales para YouTube Shorts de noticias de famosos y prensa del corazón española. Tu estilo es cinematográfico: el drama surge de los hechos, no de adjetivos vacíos. Sigues el formato exacto que te piden.",
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
    const prompt = `Crea una descripción narrativa y emocionalmente poderosa para YouTube Shorts con esta noticia de prensa del corazón española.

Título: ${newsTitle}
Resumen: ${newsSummary}

REQUISITOS ESTRICTOS:
- En español de España
- Estilo cinematográfico: cuenta una historia, no una lista de sensaciones
- PROHIBIDO usar: "BOMBAZO", "EXCLUSIVA", "REVELACIÓN", "INCREÍBLE", "ASOMBROSO"
- El drama surge de los HECHOS concretos, no de adjetivos vacíos
- MÍNIMO 800 caracteres de descripción

ESTRUCTURA OBLIGATORIA:

1. TITULAR EN MAYÚSCULAS (dos líneas, formato del título del video):
   Línea 1: ¡[GANCHO EMOCIONAL]!
   Línea 2: [CONTEXTO O MISTERIO]

2. PRIMER PÁRRAFO - Narrativa cinematográfica:
   - Empezar con dato concreto: fecha, lugar, o hecho impactante
   - Frases CORTAS que golpean. Una idea por frase.
   - Detalles específicos: nombres completos, lugares, números, citas textuales
   - Construir la historia progresivamente
   - 4-5 frases mínimo

3. SEGUNDO PÁRRAFO - Profundidad emocional:
   - La ironía del destino, la tragedia oculta, el peso de la historia
   - Terminar con 1-2 preguntas retóricas que inviten a reflexionar
   - "¿Crees que...?", "¿Qué harías tú...?"
   - 3-4 frases mínimo

4. LLAMADA A LA ACCIÓN integrada en la historia:
   ¡Dale LIKE si [acción relacionada con el tema] y SUSCRÍBETE para [motivo relacionado]!

   Ejemplos:
   - ¡Dale LIKE si rezas por los Flores y SUSCRÍBETE para no olvidar a las leyendas!
   - ¡Dale LIKE si crees que el amor de madre es eterno y SUSCRÍBETE para más historias!

5. HASHTAGS (mínimo 15):
   - #NombreCompleto #SoloApellido
   - Hashtags de su profesión/ámbito (#Radio, #Television, #Cine, etc.)
   - #TemaDeLaNoticia (#Tragedia, #Salud, #Ruptura, #Historia, etc.)
   - Conceptos emotivos (#Memoria, #Legado, #Amor, #Familia)
   - #España #Noticias #Viral #Famosos

EJEMPLO COMPLETO:
¡NO PUDO VIVIR SIN ELLA!
LA TRAGEDIA QUE MATÓ A MADRE E HIJO EN 15 DÍAS

España se detuvo cuando murió "La Faraona". Lola Flores era inmortal. Pero nadie imaginaba que la tragedia real acababa de empezar. Su hijo Antonio, la luz de sus ojos, quedó devastado. "Ella me espera", repetía con la mirada perdida en el funeral. Se encerró en la cabaña del jardín familiar, "El Lerele", sumido en una tristeza negra.

Solo pasaron 14 días. Dos semanas de agonía. Lo encontraron sin vida en la misma casa donde su madre acababa de partir. Los médicos dijeron que fue un accidente, pero España sabe la verdad: Antonio murió de amor. ¿Crees que el amor de madre es el vínculo más fuerte del mundo?

¡Dale LIKE si rezas por los Flores y SUSCRÍBETE para no olvidar a las leyendas!

#LolaFlores #AntonioFlores #LaFaraona #Tragedia #Familia #Amor #España #Famosos #Historia #Legado #Memoria #Viral #Noticias #Emotivo #Flamenco

Devuelve SOLO la descripción completa siguiendo EXACTAMENTE este formato, sin explicaciones adicionales.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres el mejor guionista de historias reales de España. Tu estilo es cinematográfico: cada noticia es una historia con personajes, contexto y emoción real. No usas adjetivos vacíos ni palabras de relleno. El drama surge de los hechos, las fechas, los nombres, las citas textuales. Escribes como si cada historia fuera un documental de Netflix.",
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

// ============================================
// PORTUGUESE NEWS-SPECIFIC TITLE AND DESCRIPTION GENERATORS
// ============================================

/**
 * Генерирует привлекательное название для YouTube Shorts с новостями на португальском
 * Формат: 😱Nome Apelido (idade) EVENTO EM CAPS (ano) #UltimaHora #Portugal
 */
export async function generateNewsShortsTitle_PT(newsTitle: string, newsSummary: string): Promise<string> {
  const currentYear = new Date().getFullYear();

  try {
    const prompt = `Cria um título para YouTube Shorts com esta notícia de imprensa cor-de-rosa portuguesa.

Título original: ${newsTitle}
Resumo: ${newsSummary}

FORMATO OBRIGATÓRIO:
[emoji][Nome Apelido] ([idade]) [EVENTO EM MAIÚSCULAS] (${currentYear}) #UltimaHora #Portugal

REQUISITOS:
- Começar com emoji dramático: 😱💔🔥😢⚠️❌💥
- Nome completo do famoso/a
- Idade entre parênteses se conhecida ou deduzível
- Evento principal em MAIÚSCULAS (máximo 5-6 palavras)
- Ano atual (${currentYear})
- Terminar com #UltimaHora #Portugal
- Máximo 90 caracteres no total

EXEMPLOS EXATOS do formato:
- 😱Cristina Ferreira (47) INTERNADA DE URGÊNCIA (${currentYear}) #UltimaHora #Portugal
- 😱Manuel Luís Goucha (69) CHORA AO VIVO NA TV (${currentYear}) #UltimaHora #Portugal
- 💔Tony Carreira (61) SEPARAÇÃO TOTAL CONFIRMADA (${currentYear}) #UltimaHora #Portugal
- 🔥Cristiano Ronaldo (39) ESCÂNDALO EM MADRID (${currentYear}) #UltimaHora #Portugal
- 😢Ana Moura (45) DRAMA DE SAÚDE REVELADO (${currentYear}) #UltimaHora #Portugal

Se não conheceres a idade exata, usa uma idade aproximada razoável para o famoso.

Devolve APENAS o título no formato exato, sem explicações.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "És um especialista em criar títulos virais para YouTube Shorts de notícias de famosos e imprensa cor-de-rosa portuguesa. Conheces as idades aproximadas dos famosos portugueses e brasileiros. Segues o formato exato que te pedem.",
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
    console.error("Failed to generate PT news title:", error);
    // Fallback com formato básico
    return `😱${newsTitle.substring(0, 50)} (${currentYear}) #UltimaHora #Portugal`;
  }
}

/**
 * Генерирует оптимизированное описание для YouTube Shorts с новостями на португальском
 * Стиль: очень драматичный, детальный, сенсационный, с интерактивом
 */
export async function generateNewsShortsDescription_PT(newsTitle: string, newsSummary: string): Promise<string> {
  try {
    const prompt = `Cria uma descrição MUITO DRAMÁTICA e DETALHADA para YouTube Shorts com esta notícia de imprensa cor-de-rosa portuguesa.

Título: ${newsTitle}
Resumo: ${newsSummary}

REQUISITOS ESTRITOS:
- Em português de Portugal
- Estilo de revista cor-de-rosa sensacionalista (Caras, Nova Gente, TV7 Dias)
- Tom MUITO dramático, emotivo, quase cinematográfico
- MÍNIMO 800 caracteres de descrição

ESTRUTURA OBRIGATÓRIA:

1. TÍTULO DRAMÁTICO EM MAIÚSCULAS (terminar com ponto)
   Exemplo: "COMOÇÃO NA TELEVISÃO: CRISTINA FERREIRA ROMPE EM LÁGRIMAS EM DIRETO."

2. PRIMEIRO PARÁGRAFO - Contexto dramático:
   - Descrever a situação com detalhes impactantes
   - Mencionar o nome completo e profissão/título do famoso
   - Incluir detalhes específicos (local, circunstâncias, reações)
   - Usar linguagem emotiva e dramática
   - 3-4 frases no mínimo

3. SEGUNDO PARÁGRAFO - Reflexão e perguntas:
   - Análise emocional da situação
   - Referência à sua vida/carreira/lutas anteriores
   - Mínimo 2-3 perguntas retóricas para gerar intriga
   - Mencionar a reação do público/Portugal
   - "Todo o Portugal se solidariza com...", "O que acontecerá agora?", etc.
   - 3-4 frases no mínimo

4. CHAMADA À AÇÃO INTERATIVA:
   👇 [PALAVRA EM CAPS]: Envia um emoji de "[emoji]" ou um coração para [ação emotiva relacionada com a notícia].

   Exemplos:
   - 👇 APOIO: Envia um emoji de "💪" ou um coração para dizer a Cristina que não está sozinha nesta batalha.
   - 👇 FORÇA: Escreve "❤️" para lhe enviar todo o teu carinho neste momento tão difícil.
   - 👇 ÂNIMO: Deixa um "🙏" para que recupere em breve.

5. HASHTAGS (mínimo 15):
   - #NomeCompleto #SóApelido
   - Hashtags da sua profissão/área (#Televisao, #Musica, #Futebol, etc.)
   - #TemaDaNoticia (#Saude, #Separacao, #Escandalo, etc.)
   - Conceitos emotivos (#Luta, #Superacao, #Drama, #Emotivo)
   - #UltimaHora #Portugal #Noticias #Viral
   - Hashtag único de apoio (#Forca[Nome], #Animo[Nome])

EXEMPLO COMPLETO:
COMOÇÃO NA TELEVISÃO: CRISTINA FERREIRA ROMPE EM LÁGRIMAS EM DIRETO.

A apresentadora mais querida de Portugal, Cristina Ferreira, paralisou o seu programa após receber uma notícia médica de última hora. O medo de uma recaída na doença voltou a atingir a comunicadora, que não conseguiu conter as lágrimas perante os telespectadores. Um momento de vulnerabilidade extrema que demonstra que, por trás das câmaras, há uma mulher lutadora mas humana.

O que dizem os médicos? Voltará a afastar-se dos ecrãs? Todo o Portugal se solidariza com Cristina nestas horas críticas. Ouve as suas emotivas palavras e a reação dos seus colegas de profissão. A luta contra a doença tem um novo capítulo.

👇 APOIO: Envia um emoji de "💪" ou um coração para dizer a Cristina que não está sozinha nesta batalha.

#CristinaFerreira #TVI #Televisao #Saude #Luta #Superacao #Mulher #UltimaHora #Portugal #Noticias #Emotivo #Viral #ForcaCristina #Apresentadora #Drama

Devolve APENAS a descrição completa seguindo EXATAMENTE este formato, sem explicações adicionais.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "És o melhor redator de imprensa cor-de-rosa de Portugal. Trabalhas para a Caras, Nova Gente e TV7 Dias. A tua especialidade é criar descrições LONGAS, DRAMÁTICAS e EMOTIVAS que prendem o leitor desde a primeira palavra. Conheces todos os famosos portugueses, as suas histórias, lutas e dramas. Escreves como se cada notícia fosse o capítulo mais importante de uma telenovela.",
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
    console.error("Failed to generate PT news description:", error);
    // Fallback
    return `ÚLTIMA HORA: ${newsTitle}

${newsSummary}

O que acontecerá agora? Todo o Portugal atento a esta notícia.

👇 APOIO: Envia um "❤️" para mostrar o teu apoio.

#Famosos #Noticias #Portugal #UltimaHora #Viral #Exclusivo #Drama #Emotivo`;
  }
}
