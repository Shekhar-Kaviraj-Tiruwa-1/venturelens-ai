export const config = { runtime: "edge" };

const VENTURE_SYSTEM_PROMPT = `You are a seasoned business analyst and startup advisor. Give founders an honest, structured validation of their business idea. You are NOT a cheerleader — surface real risks, hard questions, and honest scores.

CRITICAL OUTPUT RULE: Your response MUST be a single valid JSON object. It must start with { and end with }. No text before or after. No markdown fences. No code blocks. Pure raw JSON only.

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
          max_tokens: 1200,
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
        JSON.stringify({ success: false, error: 'Empty response from AI service' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let report: unknown;
    try {
      report = JSON.parse(rawContent);
    } catch {
      // Model sometimes wraps JSON in markdown fences or adds surrounding text — extract it
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          report = JSON.parse(match[0]);
        } catch {
          console.error('JSON extraction failed after match:', rawContent.slice(0, 200));
          return new Response(
            JSON.stringify({ success: false, error: 'AI returned an unstructured response. Please try again.' }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.error('No JSON object found in response:', rawContent.slice(0, 200));
        return new Response(
          JSON.stringify({ success: false, error: 'AI returned an unstructured response. Please try again.' }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }
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
