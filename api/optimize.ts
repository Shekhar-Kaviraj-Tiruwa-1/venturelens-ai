import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "edge" };

// ── Prompt technique templates ─────────────────────────────────────────────

type TechniqueId = "auto" | "zero_shot" | "few_shot" | "system_user" | "context_efficient" | "chain_of_thought";

const CLASSIFIER_PROMPT = `You are a prompt engineering classifier. Analyze the user's input and determine which single technique will produce the best result.

Techniques:
- zero_shot: Best for clear, direct tasks that need no examples (summaries, explanations, simple instructions)
- few_shot: Best for tasks where pattern/format must be consistent (formatting, classification, transformation)
- system_user: Best for tasks requiring a specific persona or role-play (customer service, expert advisor, character)
- context_efficient: Best for simple or repetitive tasks where brevity matters (quick lookups, short answers)
- chain_of_thought: Best for complex reasoning, math, multi-step problems, or analysis

Return ONLY one word — exactly one of: zero_shot, few_shot, system_user, context_efficient, chain_of_thought

No explanation. No punctuation. Just the technique name.`;

const TECHNIQUE_PROMPTS: Record<Exclude<TechniqueId, "auto">, string> = {
  zero_shot: `You are an expert prompt engineer. Transform the user's raw input into a structured zero-shot prompt.

A zero-shot prompt has:
- A clear ROLE for the AI
- A specific TASK statement
- Explicit CONSTRAINTS (tone, length, style, audience)
- A defined OUTPUT FORMAT

Rules:
- Return ONLY the optimized prompt text
- No explanations, no code blocks, no commentary
- Make it ready to paste directly into any AI chat`,

  few_shot: `You are an expert prompt engineer. Transform the user's raw input into a few-shot prompt that includes examples.

A few-shot prompt has:
- A clear task description
- 2-3 concrete Input → Output examples that demonstrate the exact pattern
- A final prompt line for the actual task

Rules:
- Make the examples realistic and directly relevant to the task
- The examples should clearly show the format/style expected
- Return ONLY the optimized prompt text
- No explanations, no code blocks, no commentary`,

  system_user: `You are an expert prompt engineer. Transform the user's raw input into a prompt with clearly separated SYSTEM and USER sections.

Format your output exactly like this:

SYSTEM MESSAGE:
[Define the AI's persona, expertise, tone, and behavioral rules here]

USER MESSAGE:
[Define the specific task, requirements, and expected output here]

Rules:
- The SYSTEM MESSAGE sets who the AI is and how it behaves
- The USER MESSAGE is what the user is actually asking
- Return ONLY these two sections, clearly labeled
- No extra commentary or explanation`,

  context_efficient: `You are an expert prompt engineer specializing in token efficiency. Transform the user's raw input into a compressed, high-signal prompt.

Compression rules:
- Remove filler words, pleasantries, redundancy
- Use shorthand: "w/" for with, "→" for produces/leads to, "&" for and
- Use bullets and colons instead of full sentences where possible
- Pack maximum meaning into minimum tokens
- Keep all critical constraints — just say them concisely

Return ONLY the compressed prompt. No explanations. No code blocks.`,

  chain_of_thought: `You are an expert prompt engineer. Transform the user's raw input into a chain-of-thought prompt that guides step-by-step reasoning.

A chain-of-thought prompt:
- Instructs the AI to think through the problem step by step
- Breaks the task into numbered reasoning steps
- Asks the AI to show its work before giving the final answer
- Ends with a clear instruction for the final output

Format:
- Use "Step 1:", "Step 2:", etc. to structure the reasoning
- The last step should always be the final answer/output

Return ONLY the optimized prompt text. No explanations, no code blocks.`,
};

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === "YOUR_KEY_HERE") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "ANTHROPIC_API_KEY not configured.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    // ── Resolve technique ──────────────────────────────────────────────────
    let resolvedTechnique: Exclude<TechniqueId, "auto">;

    if (technique === "auto") {
      // Classifier call: ask Claude which technique fits best
      const classifierMsg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 20,
        system: CLASSIFIER_PROMPT,
        messages: [{ role: "user", content: text }],
      });

      const raw = classifierMsg.content[0]?.type === "text"
        ? classifierMsg.content[0].text.trim().toLowerCase()
        : "zero_shot";

      const validTechniques: Exclude<TechniqueId, "auto">[] = [
        "zero_shot", "few_shot", "system_user", "context_efficient", "chain_of_thought",
      ];

      resolvedTechnique = validTechniques.includes(raw as any)
        ? (raw as Exclude<TechniqueId, "auto">)
        : "zero_shot";
    } else {
      resolvedTechnique = technique as Exclude<TechniqueId, "auto">;
    }

    const systemPrompt = TECHNIQUE_PROMPTS[resolvedTechnique];

    // ── Main optimization call ─────────────────────────────────────────────
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: `Optimize this request:\n\n"${text}"` }],
    });

    const optimizedText =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : text;

    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;

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
  } catch (error: any) {
    if (error.status === 401) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid Anthropic API key.",
          code: "INVALID_API_KEY",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (error.status === 429) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Rate limit exceeded. Please try again shortly.",
          code: "RATE_LIMITED",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to optimize prompt",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
