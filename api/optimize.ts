export const config = { runtime: "edge" };

// ── Technique prompts ──────────────────────────────────────────────────────
// Each technique produces a Business Idea Brief — a clean description of the
// founder's idea suitable for validation, not a generic AI prompt or step list.

type TechniqueId = "auto" | "zero_shot" | "few_shot" | "system_user" | "context_efficient" | "chain_of_thought";

const BRIEF_FORMAT = `Idea: [one sentence — what the product or service is]
Target Customer: [specific persona with a real pain]
Problem: [the pain being solved and why it matters]
Solution: [how the product or service solves it]
Value Proposition: [why this is better than existing alternatives]
Key Assumptions: [what must be true for this to succeed]`;

const TECHNIQUE_PROMPTS: Record<Exclude<TechniqueId, "auto">, string> = {
  zero_shot: `You are a business analyst who helps founders clarify and structure their ideas.

Transform the founder's raw input into a clean Business Idea Brief. The brief describes the idea itself — it is not a prompt for another AI, and it contains no step-by-step instructions.

Output format:
${BRIEF_FORMAT}

Rules:
- Write the brief as a clear business description, not as instructions
- Be specific and concrete — avoid vague generalities
- Do not use "Step 1", "Step 2", or similar structures
- Do not write "Now provide..." or address another AI
- Return ONLY the brief — no preamble, no commentary`,

  few_shot: `You are a business analyst who helps founders clarify their ideas into structured briefs.

Transform the founder's raw input into a clean Business Idea Brief using the pattern below.

Example input:
"An app that uses AI to match people who want to learn guitar with local teachers based on their schedule and music taste."

Example output:
Idea: A mobile app that matches aspiring guitar learners with local instructors based on availability and musical style preferences.
Target Customer: Adults aged 25–40 who want to learn guitar but struggle to find a teacher who fits their schedule and taste.
Problem: Most guitar teachers are discovered through word-of-mouth or generic classifieds, with no way to filter by style, availability, or fit.
Solution: AI-powered matching that considers learning goals, preferred genres, weekly availability, and budget to surface the right local teachers.
Value Proposition: Faster, better-fit matches than generic music teacher directories, with less friction than reaching out cold.
Key Assumptions: Enough local teachers are willing to list on the platform; learners are willing to pay a small matching fee or subscription.

Now apply this pattern to the founder's idea:

${BRIEF_FORMAT}

Return ONLY the brief — no preamble, no commentary.`,

  system_user: `You are a senior business analyst. Your job is to listen to a founder's rough idea and restate it as a clear, structured Business Idea Brief.

The brief describes the business idea itself — clearly and concisely. It is not a set of instructions for another AI. It is a document a startup advisor would read to quickly understand the idea.

Output format:
${BRIEF_FORMAT}

Return ONLY the brief. No preamble, no step lists, no instructions to other systems.`,

  context_efficient: `You are a business analyst. Extract the core of the founder's idea and compress it into a tight Business Idea Brief. Keep every field to 1–2 sentences maximum.

Output format:
${BRIEF_FORMAT}

Rules:
- Cut filler, hedge words, and repetition
- Be specific and concrete
- No step lists, no instructions, no preamble
- Return ONLY the brief`,

  chain_of_thought: `You are a business analyst. A founder has shared a rough idea. Think through it carefully — who the real customer is, what pain they have, whether the solution actually addresses it, and what must be true for it to work.

Do not show your thinking. Do not write reasoning steps in your output.

Output only a clean Business Idea Brief:
${BRIEF_FORMAT}

Return ONLY the brief — no visible reasoning, no step lists, no commentary.`,
};

const VALID_TECHNIQUES: Exclude<TechniqueId, "auto">[] = [
  "zero_shot", "few_shot", "system_user", "context_efficient", "chain_of_thought",
];

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { text, mode = "speech", technique = "auto" } = body as {
      text: string;
      mode?: string;
      technique?: TechniqueId;
    };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Text is required and must be a non-empty string" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (text.length > 4000) {
      return new Response(
        JSON.stringify({ success: false, error: "Text too long (max 4000 characters)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OPENROUTER_API_KEY not configured." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const model =
      process.env.OPENROUTER_OPTIMIZER_MODEL ||
      process.env.OPENROUTER_MODEL ||
      "anthropic/claude-haiku-4-5";

    // auto defaults to zero_shot — no extra classifier call needed
    const resolvedTechnique: Exclude<TechniqueId, "auto"> =
      VALID_TECHNIQUES.includes(technique as Exclude<TechniqueId, "auto">)
        ? (technique as Exclude<TechniqueId, "auto">)
        : "zero_shot";

    const systemPrompt = TECHNIQUE_PROMPTS[resolvedTechnique];

    const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://venturelens.ai",
        "X-Title": "VentureLens AI",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here is the founder's raw idea:\n\n"${text}"` },
        ],
        max_tokens: 1024,
        temperature: 0.5,
      }),
    });

    if (!orResponse.ok) {
      const errText = await orResponse.text();
      console.error("OpenRouter optimize error:", errText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `AI service error (${orResponse.status}). Check your OPENROUTER_API_KEY.`,
        }),
        { status: orResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const orData = await orResponse.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const optimizedText = orData.choices?.[0]?.message?.content?.trim() ?? text;
    const inputTokens = orData.usage?.prompt_tokens || 0;
    const outputTokens = orData.usage?.completion_tokens || 0;

    return new Response(
      JSON.stringify({
        success: true,
        originalText: text,
        optimizedText,
        mode,
        technique_used: resolvedTechnique,
        promptId: crypto.randomUUID(),
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to optimize prompt";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
