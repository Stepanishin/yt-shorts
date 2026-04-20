const BASE_TAGS = [
  "slovenija",
  "novice",
  "znani slovenci",
  "shorts",
  "viral",
  "slovenia",
  "famous slovenians",
];

export async function generateNewsTagsSL(
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
            "You extract YouTube tags from Slovenian news about famous people. Respond ONLY with a JSON array of strings.",
        },
        {
          role: "user",
          content: `Extract YouTube tags from this Slovenian news.

Title: ${title}
Summary: ${summary}

Return a JSON array with 10-15 tags. Include:
- Full name of the person (e.g. "luka dončić")
- Last name only (e.g. "dončić")
- First name only (e.g. "luka")
- Profession in Slovenian (e.g. "košarkar", "politik", "pevka")
- Profession in English (e.g. "basketball player", "politician")
- Main topic in Slovenian (e.g. "zmaga", "skandal", "nagrada")
- Related location if applicable (e.g. "ljubljana", "dallas")

Mix Slovenian and English tags for wider reach. No # or capitals. Respond ONLY with the JSON array.`,
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

    const finalTags: string[] = [];
    let totalLength = 0;
    for (const tag of unique) {
      if (totalLength + tag.length + 1 > 490 || finalTags.length >= 30) break;
      finalTags.push(tag);
      totalLength += tag.length + 1;
    }

    console.log(`Generated ${finalTags.length} Slovenian tags: ${finalTags.join(", ")}`);
    return finalTags;
  } catch (error) {
    console.error("Failed to generate Slovenian tags, using defaults:", error);
    return [...BASE_TAGS, ...(configTags || [])];
  }
}
