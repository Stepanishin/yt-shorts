/**
 * Generate dynamic YouTube tags for English news videos.
 * Extracts celebrity names, topics, and relevant keywords
 * to maximize search discoverability.
 */

const BASE_TAGS = [
  "celebrity",
  "gossip",
  "hollywood",
  "entertainment",
  "shorts",
  "viral",
  "breaking news",
];

/**
 * Generate dynamic tags from news title and summary using GPT
 */
export async function generateNewsTagsEN(
  title: string,
  summary: string,
  configTags?: string[]
): Promise<string[]> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You extract YouTube tags from celebrity news. Respond ONLY with a JSON array of strings.",
        },
        {
          role: "user",
          content: `Extract YouTube tags from this English celebrity news.

Title: ${title}
Summary: ${summary}

Return a JSON array with 10-15 tags. Include:
- Full celebrity name (e.g. "taylor swift")
- Last name only (e.g. "swift")
- First name only (e.g. "taylor")
- Profession (e.g. "singer", "actress", "host")
- TV show if applicable (e.g. "keeping up with the kardashians", "the tonight show")
- Main topic (e.g. "breakup", "health", "wedding", "scandal")
- Royal family if applicable (e.g. "royal family", "buckingham palace")

Only English tags, no # or capitals. Respond ONLY with the JSON array.`,
        },
      ],
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content?.trim() || "[]";
    const cleaned = raw
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const dynamicTags: string[] = JSON.parse(cleaned);

    const allTags = [
      ...dynamicTags.map((t) => t.toLowerCase().trim()),
      ...BASE_TAGS,
      ...(configTags || []).map((t) => t.toLowerCase().trim()),
    ];

    const unique = [...new Set(allTags)].filter((t) => t.length > 0);

    // YouTube allows max 500 chars total for tags, max ~30 tags
    const finalTags: string[] = [];
    let totalLength = 0;
    for (const tag of unique) {
      if (totalLength + tag.length + 1 > 490 || finalTags.length >= 30) break;
      finalTags.push(tag);
      totalLength += tag.length + 1;
    }

    console.log(`🏷️  Generated ${finalTags.length} English tags: ${finalTags.join(", ")}`);
    return finalTags;
  } catch (error) {
    console.error("Failed to generate dynamic tags, using defaults:", error);
    return [...BASE_TAGS, ...(configTags || [])];
  }
}
