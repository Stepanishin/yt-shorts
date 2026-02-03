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
