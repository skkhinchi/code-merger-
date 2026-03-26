import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function parseJsonFromAssistantText(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) return JSON.parse(fence[1].trim());
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return parseable JSON");
  }
}

export async function parseCommand(userInput) {
  const prompt = `
Convert the user's git merge command into JSON.

IMPORTANT RULE:
"merge A to B" means:
- source = A
- target = B

Examples:
"merge dev to tnqa" → {"action":"merge","source":"dev","target":"tnqa"}
"merge development to staging" → {"action":"merge","source":"development","target":"staging"}

Return ONLY JSON.

Command: ${userInput}
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = res.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty response from AI");
  }

  try {
    return JSON.parse(content);
  } catch {
    return parseJsonFromAssistantText(content);
  }
}