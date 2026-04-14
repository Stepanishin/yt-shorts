/**
 * AI-powered news scorer that evaluates viral potential
 * for the English "Celebrity Unfiltered" channel.
 *
 * Scoring based on US/UK celebrity engagement patterns:
 * - Top US/UK celebrities + emotional stories = highest engagement
 * - British Royals + drama = consistent high views
 * - Unknown/niche celebrities = very low views
 */

export interface NewsScore {
  score: number; // 1-10 (10 = highest viral potential)
  reason: string;
  shouldPublish: boolean;
}

/**
 * Score an English news item for viral potential using GPT
 * Returns score 1-10 and whether it should be published
 */
export async function scoreNewsCandidateEN(
  title: string,
  summary: string
): Promise<NewsScore> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `You are a data analyst for a YouTube celebrity news channel called "Celebrity Unfiltered". Your job is to predict the viral potential of each news story BEFORE the video is created.

REAL CHANNEL DATA patterns:
- Videos with 100K-500K views: top US/UK celebrities (Kardashians, Taylor Swift, Beyoncé, Brad Pitt, Selena Gomez), British Royals, emotional/dramatic stories
- Videos with 30K-100K views: well-known celebrities, royal family updates, stories involving two famous names together
- Videos with 5K-30K views: mid-tier celebrities, routine but interesting topics
- Videos with <1K views: unknown personalities, niche influencers, boring institutional topics

SCORING RULES:
- 9-10: Top US/UK celebrity (Kardashians, Taylor Swift, Beyoncé, Brad Pitt, Selena Gomez, Meghan Markle, etc.) + strong emotional topic (death, illness, scandal, breakup, pregnancy)
- 7-8: Well-known celebrity + interesting topic, OR British Royals + drama/controversy
- 5-6: Medium celebrity, routine but publishable topic
- 3-4: Minor celebrity or boring topic
- 1-2: Unknown person or irrelevant/institutional topic

News to evaluate:
Title: ${title}
Summary: ${summary}

Respond ONLY with this exact JSON format (no markdown, no backticks):
{"score": X, "reason": "short explanation in English"}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a data analyst specialized in YouTube Shorts for US/UK celebrity news. You respond ONLY in valid JSON.",
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
    console.error("Failed to score news:", error);
    return {
      score: 5,
      reason: "Scoring error, publishing by default",
      shouldPublish: true,
    };
  }
}
