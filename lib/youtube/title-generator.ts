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
      model: "gpt-5",
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
      model: "gpt-5",
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
- Edad entre paréntesis si se conoce o se puede deducir razonablemente
- Evento principal en MAYÚSCULAS (máximo 5-6 palabras): elegir el hecho MÁS impactante y concreto
- Año actual (${currentYear})
- Terminar con #UltimaHora #España
- Máximo 100 caracteres en total

EJEMPLOS EXACTOS del formato:
- 😱Carmen Lomana (77) ICTUS GRAVE EN SU MANSIÓN (${currentYear}) #UltimaHora #España
- 💔Ana Obregón (69) RUPTURA TOTAL CON SU FAMILIA (${currentYear}) #UltimaHora #España
- 🔥Tamara Falcó (42) ABANDONA EL PROGRAMA EN DIRECTO (${currentYear}) #UltimaHora #España
- 😢Isabel Pantoja (68) INGRESADA DE URGENCIA (${currentYear}) #UltimaHora #España

Si no conoces la edad exacta, usa una edad aproximada razonable para el famoso.

Devuelve SOLO el título en el formato exacto, sin explicaciones.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
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
    const prompt = `Crea una descripción para YouTube Shorts con esta noticia de prensa del corazón española. Estilo híbrido: gancho sensacionalista + narrativa cinematográfica con hechos concretos.

Título: ${newsTitle}
Resumen: ${newsSummary}

REQUISITOS ESTRICTOS:
- En español de España
- MÍNIMO 800 caracteres de descripción
- Las palabras impactantes (¡BOMBAZO!, ¡ESCÁNDALO!, etc.) solo si el hecho las justifica — nunca en el vacío

ESTRUCTURA OBLIGATORIA:

1. TITULAR EN MAYÚSCULAS (una o dos líneas):
   ¡[GANCHO SENSACIONALISTA basado en el hecho más impactante]!

2. PRIMER PÁRRAFO - Narrativa con hechos:
   - Empezar con dato concreto: fecha, lugar, o hecho impactante
   - Frases CORTAS que golpean. Una idea por frase.
   - Detalles específicos: nombres completos, lugares, números, citas textuales
   - 4-5 frases mínimo

3. SEGUNDO PÁRRAFO - Profundidad emocional:
   - La ironía del destino, la tragedia oculta, el peso de la historia
   - Terminar con 1-2 preguntas retóricas: "¿Crees que...?", "¿Qué harías tú...?"
   - 3-4 frases mínimo

4. LLAMADA A LA ACCIÓN:
   ¡Dale LIKE si [acción relacionada] y SUSCRÍBETE para [motivo relacionado]!

5. HASHTAGS (mínimo 15):
   - #NombreCompleto #SoloApellido
   - Hashtags de su profesión/ámbito (#Radio, #Television, #Cine, etc.)
   - #TemaDeLaNoticia (#Tragedia, #Salud, #Ruptura, #Historia, etc.)
   - #España #Noticias #Viral #Famosos #UltimaHora

EJEMPLO COMPLETO:
¡TRAGEDIA que partió a España en dos!
LA MADRE Y EL HIJO MUERTOS EN 15 DÍAS

España se detuvo cuando murió "La Faraona". Lola Flores era inmortal. Pero nadie imaginaba que la tragedia real acababa de empezar. Su hijo Antonio quedó devastado. "Ella me espera", repetía con la mirada perdida. Se encerró en la cabaña familiar, "El Lerele", sumido en una tristeza negra.

Solo pasaron 14 días. Lo encontraron sin vida en la misma casa donde su madre acababa de partir. Los médicos dijeron que fue un accidente, pero España sabe la verdad: Antonio murió de amor. ¿Crees que el amor de madre es el vínculo más fuerte del mundo?

¡Dale LIKE si rezas por los Flores y SUSCRÍBETE para no olvidar a las leyendas!

#LolaFlores #AntonioFlores #LaFaraona #Tragedia #Familia #Amor #España #Famosos #Historia #Legado #Memoria #Viral #Noticias #Emotivo #UltimaHora

Devuelve SOLO la descripción completa siguiendo EXACTAMENTE este formato, sin explicaciones adicionales.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "Eres el mejor redactor de prensa del corazón de España. Tu estilo mezcla el gancho sensacionalista de ¡Hola! y Lecturas con la narrativa cinematográfica de un documental: empiezas con un impacto, luego despliegas la historia con hechos concretos. Conoces a todos los famosos españoles.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],

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
// ENGLISH NEWS-SPECIFIC TITLE AND DESCRIPTION GENERATORS
// ============================================

/**
 * Generate catchy YouTube Shorts title for English celebrity news
 * Format: [emoji][Celebrity Name] (age) EVENT IN CAPS (year) #BreakingNews #Celebrity
 */
export async function generateNewsShortsTitle_EN(newsTitle: string, newsSummary: string): Promise<string> {
  const currentYear = new Date().getFullYear();

  try {
    const prompt = `Create a title for a YouTube Shorts video about this English celebrity news story.

Original title: ${newsTitle}
Summary: ${newsSummary}

REQUIRED FORMAT:
[emoji][Celebrity Name] ([age]) [EVENT IN CAPS] (${currentYear}) #BreakingNews #Celebrity

REQUIREMENTS:
- Start with a dramatic emoji: 😱💔🔥😢⚠️❌💥
- Full name of the celebrity
- Age in parentheses if known or reasonably deducible
- Main event in CAPS (max 5-6 words): choose the MOST shocking and concrete fact
- Current year (${currentYear})
- End with #BreakingNews #Celebrity
- Max 100 characters total

EXACT FORMAT EXAMPLES:
- 😱Kim Kardashian (45) SHOCKING DIVORCE BOMBSHELL REVEALED (${currentYear}) #BreakingNews #Celebrity
- 💔Taylor Swift (36) HEARTBREAKING SPLIT CONFIRMED (${currentYear}) #BreakingNews #Celebrity
- 🔥Prince Harry (41) WALKS OUT OF ROYAL EVENT (${currentYear}) #BreakingNews #Celebrity
- 😢Beyoncé (44) RUSHED TO HOSPITAL (${currentYear}) #BreakingNews #Celebrity

If you don't know the exact age, use a reasonable approximate age for the celebrity.

Return ONLY the title in the exact format, no explanations.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert at creating viral YouTube Shorts titles for English celebrity and tabloid news. You know the approximate ages of American and British celebrities. You follow the exact format requested.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const title = response.choices[0]?.message?.content?.trim();

    if (!title) {
      throw new Error("No title generated");
    }

    return title;
  } catch (error) {
    console.error("Failed to generate EN news title:", error);
    return `😱${newsTitle.substring(0, 50)} (${currentYear}) #BreakingNews #Celebrity`;
  }
}

/**
 * Generate optimized YouTube Shorts description for English celebrity news
 * Style: very dramatic, detailed, sensationalist, with engagement hooks
 */
export async function generateNewsShortsDescription_EN(newsTitle: string, newsSummary: string): Promise<string> {
  try {
    const prompt = `Create a VERY DRAMATIC and DETAILED description for a YouTube Shorts video about this English celebrity news story.

Title: ${newsTitle}
Summary: ${newsSummary}

STRICT REQUIREMENTS:
- In English
- Tabloid sensationalist style (TMZ, People, US Weekly, Daily Mail)
- VERY dramatic, emotional, almost cinematic tone
- MINIMUM 800 characters

REQUIRED STRUCTURE:

1. DRAMATIC HEADLINE IN CAPS (one or two lines):
   [SENSATIONALIST HOOK based on the most shocking fact]!

2. FIRST PARAGRAPH - Context with facts:
   - Start with a concrete detail: date, place, or shocking fact
   - SHORT sentences that hit hard. One idea per sentence.
   - Specific details: full names, places, numbers, direct quotes
   - 4-5 sentences minimum

3. SECOND PARAGRAPH - Emotional depth:
   - The irony of fate, the hidden tragedy, the weight of the story
   - End with 1-2 rhetorical questions: "Do you think...?", "What would you do...?"
   - 3-4 sentences minimum

4. CALL TO ACTION:
   Hit LIKE if [related action] and SUBSCRIBE for [related reason]!

5. HASHTAGS (minimum 15):
   - #FullName #LastNameOnly
   - Hashtags for their profession/field (#Music, #Television, #Movies, etc.)
   - #TopicOfTheNews (#Tragedy, #Health, #Breakup, #Scandal, etc.)
   - #Celebrity #Entertainment #Viral #BreakingNews #Hollywood

FULL EXAMPLE:
TRAGEDY THAT SHOOK HOLLYWOOD TO ITS CORE!
MOTHER AND SON GONE WITHIN 15 DAYS

Hollywood froze when "The Queen of Pop" passed away. She seemed invincible. But nobody imagined the real tragedy had just begun. Her son was devastated. "She's waiting for me," he repeated with a vacant stare. He locked himself in the family home, consumed by unbearable grief.

Only 14 days passed. They found him lifeless in the same house where his mother had just departed. Doctors said it was an accident, but Hollywood knows the truth: he died of a broken heart. Do you believe a mother's love is the strongest bond in the world?

Hit LIKE if this story moved you and SUBSCRIBE so we never forget the legends!

#Celebrity #Hollywood #Tragedy #Family #Love #Entertainment #BreakingNews #Viral #Emotional #Legacy #Memory #RIP #Drama #Heartbreaking #Legend

Return ONLY the complete description following EXACTLY this format, no additional explanations.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are the best entertainment journalist in Hollywood. Your style combines the sensationalist hook of TMZ with the cinematic narrative of a documentary: you start with impact, then unfold the story with concrete facts. You know all American and British celebrities.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const description = response.choices[0]?.message?.content?.trim();

    if (!description) {
      throw new Error("No description generated");
    }

    return description;
  } catch (error) {
    console.error("Failed to generate EN news description:", error);
    return `BREAKING NEWS: ${newsTitle}

${newsSummary}

What happens next? All eyes on this developing story.

👇 SUPPORT: Drop a "❤️" to show your support.

#Celebrity #Entertainment #BreakingNews #Hollywood #Viral #Exclusive #Drama #Emotional`;
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
      model: "gpt-5",
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
      model: "gpt-5",
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

/**
 * Generate catchy YouTube Shorts title for Slovenian news
 */
export async function generateNewsShortsTitle_SL(newsTitle: string, newsSummary: string): Promise<string> {
  const currentYear = new Date().getFullYear();

  try {
    const prompt = `Create a title for a YouTube Shorts video about this Slovenian news story.

Original title: ${newsTitle}
Summary: ${newsSummary}

REQUIRED FORMAT:
[emoji][Person Name] [EVENT IN CAPS] (${currentYear}) #Slovenija #Novice

REQUIREMENTS:
- Start with a dramatic emoji: 😱💔🔥😢⚠️❌💥
- Full name of the person
- Main event in CAPS (max 5-6 words) in SLOVENIAN
- Current year (${currentYear})
- End with #Slovenija #Novice
- Max 100 characters total
- In SLOVENIAN language

EXACT FORMAT EXAMPLES:
- 😱Luka Dončić ŠOKANTNA NOVICA IZ NBA (${currentYear}) #Slovenija #Novice
- 💔Tadej Pogačar PRETRESLJIV RAZPLET NA TOURU (${currentYear}) #Slovenija #Novice
- 🔥Tina Maze NEPRIČAKOVANA VRNITEV (${currentYear}) #Slovenija #Novice

Return ONLY the title in the exact format, no explanations.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert at creating viral YouTube Shorts titles for Slovenian news about famous people. You write in Slovenian. You follow the exact format requested.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const title = response.choices[0]?.message?.content?.trim();

    if (!title) {
      throw new Error("No title generated");
    }

    return title;
  } catch (error) {
    console.error("Failed to generate SL news title:", error);
    return `😱${newsTitle.substring(0, 50)} (${currentYear}) #Slovenija #Novice`;
  }
}

/**
 * Generate optimized YouTube Shorts description for Slovenian news
 */
export async function generateNewsShortsDescription_SL(newsTitle: string, newsSummary: string): Promise<string> {
  try {
    const prompt = `Create a DRAMATIC and DETAILED description for a YouTube Shorts video about this Slovenian news story.

Title: ${newsTitle}
Summary: ${newsSummary}

STRICT REQUIREMENTS:
- In SLOVENIAN language
- Dramatic, emotional, engaging tone
- MINIMUM 600 characters

REQUIRED STRUCTURE:

1. DRAMATIC HEADLINE IN CAPS (one or two lines):
   [SENSATIONALIST HOOK based on the most shocking fact]!

2. FIRST PARAGRAPH - Context with facts:
   - Start with a concrete detail: date, place, or shocking fact
   - SHORT sentences. One idea per sentence.
   - Specific details: full names, places, numbers
   - 4-5 sentences minimum

3. SECOND PARAGRAPH - Emotional depth:
   - End with 1-2 rhetorical questions
   - 3-4 sentences minimum

4. CALL TO ACTION:
   Pritisnite VŠEČEK in se NAROČITE za več novic!

5. HASHTAGS (minimum 10):
   - #ImePriimek
   - #Slovenija #Novice #Viral #Shorts #ZnaniSlovenci

Return ONLY the complete description, no additional explanations.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert at creating engaging YouTube Shorts descriptions for Slovenian news about famous people. You write in fluent Slovenian.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const description = response.choices[0]?.message?.content?.trim();

    if (!description) {
      throw new Error("No description generated");
    }

    return description;
  } catch (error) {
    console.error("Failed to generate SL news description:", error);
    return `ZADNJE NOVICE: ${newsTitle}

${newsSummary}

Kaj bo sledilo? Vsa Slovenija spremlja to novico.

Pritisnite VŠEČEK in se NAROČITE za več novic!

#Slovenija #Novice #ZnaniSlovenci #Viral #Shorts`;
  }
}
