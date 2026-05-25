export const config = { runtime: "edge" };

const VENTURE_SYSTEM_PROMPT = `You are a seasoned business analyst and startup advisor. Give founders an honest, structured validation of their business idea. You are NOT a cheerleader — surface real risks, hard questions, and honest scores.

CRITICAL OUTPUT RULE: Your response MUST be a single valid JSON object.
- Begin immediately with { — no preamble, no title, no explanation
- End with } — no trailing text or summary
- Do NOT use markdown code fences (never write \`\`\` or \`\`\`json)
- Do NOT add comments or annotations inside the JSON
- Your entire response must pass JSON.parse() with zero preprocessing

Return ONLY a valid JSON object matching this exact schema:

{
  "cleanedIdea": "one clear sentence restating the idea without jargon",
  "problemStatement": "2-3 sentences describing the pain and who has it",
  "targetCustomer": "2-3 sentences describing a specific persona, not everyone",
  "valueProposition": "2-3 sentences on why this solution, why now, why better than alternatives",
  "keyAssumptions": ["assumption that must be true for this to work"],
  "mainRisks": [
    { "risk": "description of the risk", "severity": "High" },
    { "risk": "description of the risk", "severity": "Medium" },
    { "risk": "description of the risk", "severity": "Low" }
  ],
  "mvpFeatures": ["smallest feature to test the core assumption"],
  "validationQuestions": ["question 1", "question 2", "question 3", "question 4", "question 5"],
  "customerObjections": ["objection 1", "objection 2", "objection 3"],
  "scores": {
    "desirability": { "score": 7, "rationale": "one sentence rationale" },
    "feasibility":  { "score": 5, "rationale": "one sentence rationale" },
    "viability":    { "score": 6, "rationale": "one sentence rationale" },
    "novelty":      { "score": 4, "rationale": "one sentence rationale" }
  },
  "recommendation": "Validate More",
  "recommendationReason": "First sentence of reason. Second sentence of reason."
}

Rules:
- keyAssumptions: 3-5 items
- mainRisks: exactly 3 items; severity must be "High", "Medium", or "Low"
- mvpFeatures: 3-5 items
- validationQuestions: exactly 5 items
- customerObjections: exactly 3 items
- scores: each score is an integer 1-10
- recommendation: exactly one of "Build", "Validate More", "Pivot", "Stop"
- recommendationReason: exactly 2 sentences

Scoring (1-10): 8-10 = strong evidence, 5-7 = needs validation, 3-4 = concerning, 1-2 = fundamental problem.
Recommendation: "Build" if all scores ≥ 7. "Validate More" if average ≥ 5.5. "Pivot" if concept has merit but execution needs major change. "Stop" if average < 5 or multiple fundamental problems.`;

function getReportTypeInstruction(reportType: string): string {
  const map: Record<string, string> = {
    lean_canvas:
      'Structure your analysis following Lean Canvas methodology, mapping insights to: Problem, Solution, Unique Value Proposition, Unfair Advantage, Customer Segments, Key Metrics, Channels, Cost Structure, and Revenue Streams.',
    customer_discovery:
      'Focus heavily on customer discovery. Emphasise who the customer is, what pain they have, how to reach them, and what to ask them. Make validationQuestions and customerObjections especially thorough and specific.',
    mvp_plan:
      'Focus on the minimum viable product. In mvpFeatures, list only what is strictly necessary to test the core assumption and cut everything else. Rank keyAssumptions by what must be tested first.',
    investor_pitch:
      'Evaluate from an investor lens: market size, defensibility, revenue model, and scalability potential. Be especially critical in scores and recommendationReason — investors need honesty, not encouragement.',
    risk_assumption:
      'Focus on risks and assumptions above all else. Be exhaustive in mainRisks (use the full severity range) and keyAssumptions. Score conservatively and surface every way this could fail.',
    market_validation:
      'Focus on market validation: real demand signals, estimated market size, existing competitors, and whether this solves a vitamin vs painkiller problem. Ground validationQuestions in market research actions.',
  };
  return map[reportType] || '';
}

// Attempt to extract a parseable JSON object from a model response that may
// include markdown fences, preamble text, or other wrapping.
function extractReport(raw: string): unknown | null {
  // 1. Direct parse — succeeds when the model behaves correctly
  try { return JSON.parse(raw); } catch {}

  // 2. Strip markdown fences and retry
  const stripped = raw
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?\s*```\s*$/m, '')
    .trim();
  try { return JSON.parse(stripped); } catch {}

  // 3. Extract the first {...} block from whatever remains
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }

  return null;
}

// Returned when all parse attempts fail so the UI still renders a usable report.
function buildFallbackReport(idea: string) {
  const brief = idea.length > 150 ? idea.slice(0, 147) + '...' : idea;
  return {
    cleanedIdea: brief,
    problemStatement: 'The validation analysis could not be completed. Please click Generate again to retry.',
    targetCustomer: 'Could not be determined — please regenerate the report.',
    valueProposition: 'Could not be determined — please regenerate the report.',
    keyAssumptions: ['Please regenerate the report for accurate assumptions.'],
    mainRisks: [
      { risk: 'Report generation encountered an issue — please retry.', severity: 'High' as const },
      { risk: 'Consider shortening or simplifying your idea description.', severity: 'Medium' as const },
      { risk: 'If this persists, try a different report type or technique.', severity: 'Low' as const },
    ],
    mvpFeatures: ['Regenerate the report to get MVP feature recommendations.'],
    validationQuestions: [
      'Please regenerate the report for validation questions.',
      'Consider simplifying your idea description.',
      'Try a different report type.',
      'Ensure your OpenRouter API key has sufficient credits.',
      'Try again in a few moments if the issue persists.',
    ],
    customerObjections: [
      'Report generation failed — please try again.',
      'Try with a shorter, more focused idea description.',
      'Switch to a different technique and regenerate.',
    ],
    scores: {
      desirability: { score: 5, rationale: 'Could not be scored — please regenerate.' },
      feasibility:  { score: 5, rationale: 'Could not be scored — please regenerate.' },
      viability:    { score: 5, rationale: 'Could not be scored — please regenerate.' },
      novelty:      { score: 5, rationale: 'Could not be scored — please regenerate.' },
    },
    recommendation: 'Validate More' as const,
    recommendationReason: 'This is a placeholder result — the AI response could not be parsed. Please click Generate again to get an accurate validation report.',
  };
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json() as { idea?: string; reportType?: string };
    const { idea, reportType = 'auto' } = body;

    if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Idea is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'OPENROUTER_API_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4-5';
    const trimmedIdea = idea.trim().slice(0, 1500);

    const reportTypeInstruction = getReportTypeInstruction(reportType);
    const systemPrompt = reportTypeInstruction
      ? `${VENTURE_SYSTEM_PROMPT}\n\nADDITIONAL FOCUS: ${reportTypeInstruction}`
      : VENTURE_SYSTEM_PROMPT;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let orResponse: Response;
    try {
      orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://venturelens.ai',
          'X-Title': 'VentureLens AI',
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze this business idea:\n\n${trimmedIdea}` },
          ],
          max_tokens: 1500,
          temperature: 0.5,
        }),
        signal: controller.signal,
      });
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      return new Response(
        JSON.stringify({
          success: false,
          error: isTimeout
            ? 'Validation timed out. Try a shorter idea or a faster model.'
            : 'Could not reach AI service. Please try again.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    clearTimeout(timeoutId);

    if (!orResponse.ok) {
      const errText = await orResponse.text();
      console.error('OpenRouter error:', errText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `AI service error (${orResponse.status}). Check your OPENROUTER_API_KEY.`,
        }),
        { status: orResponse.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const orData = await orResponse.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const rawContent = orData.choices?.[0]?.message?.content;

    if (!rawContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'Empty response from AI service.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const report = extractReport(rawContent) ?? buildFallbackReport(trimmedIdea);
    if (!extractReport(rawContent)) {
      console.error('All JSON parse attempts failed — returning fallback report. Raw prefix:', rawContent.slice(0, 200));
    }

    return new Response(
      JSON.stringify({
        success: true,
        report,
        usage: {
          inputTokens: orData.usage?.prompt_tokens || 0,
          outputTokens: orData.usage?.completion_tokens || 0,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
