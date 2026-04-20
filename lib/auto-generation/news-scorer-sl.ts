export interface NewsScore {
  score: number;
  reason: string;
  shouldPublish: boolean;
}

export async function scoreNewsCandidateSL(
  title: string,
  summary: string
): Promise<NewsScore> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `You are a data analyst for a YouTube news channel about famous Slovenian people. Your job is to predict the viral potential of each news story BEFORE the video is created.

SCORING RULES:
- 9-10: Top Slovenian celebrity (athletes like Luka Dončić, Jan Oblak, Tadej Pogačar, Tina Maze; politicians like Janez Janša, Robert Golob; musicians, actors) + strong emotional topic (scandal, achievement, personal drama)
- 7-8: Well-known Slovenian personality + interesting topic, OR major national event involving famous people
- 5-6: Medium-known person, routine but publishable topic about Slovenian public figures
- 3-4: Minor personality or boring topic
- 1-2: Unknown person or irrelevant/institutional topic not involving famous people

News to evaluate:
Title: ${title}
Summary: ${summary}

Respond ONLY with this exact JSON format (no markdown, no backticks):
{"score": X, "reason": "short explanation in Slovenian"}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a data analyst specialized in YouTube Shorts for Slovenian news about famous people. You respond ONLY in valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content?.trim() || "";
    const cleaned = raw
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    const score = Math.min(10, Math.max(1, Number(parsed.score) || 1));
    const reason = String(parsed.reason || "No reason provided");

    return {
      score,
      reason,
      shouldPublish: score >= 5,
    };
  } catch (error) {
    console.error("Failed to score Slovenian news:", error);
    return {
      score: 5,
      reason: "Scoring error, publishing by default",
      shouldPublish: true,
    };
  }
}
