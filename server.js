// Local development server — mirrors the Vercel API functions at localhost:3001
// Run with: node server.js
// Requires Node 18+ (uses native fetch)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}
console.log('[env] OPENROUTER_API_KEY loaded:', !!process.env.OPENROUTER_API_KEY);
console.log('[env] OPENROUTER_MODEL loaded:', !!process.env.OPENROUTER_MODEL);
console.log('[env] OPENROUTER_OPTIMIZER_MODEL loaded:', !!process.env.OPENROUTER_OPTIMIZER_MODEL);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

// ── Prompt technique templates (mirrors api/optimize.ts) ────────────────────

const BRIEF_FORMAT = `Idea: [one sentence — what the product or service is]
Target Customer: [specific persona with a real pain]
Problem: [the pain being solved and why it matters]
Solution: [how the product or service solves it]
Value Proposition: [why this is better than existing alternatives]
Key Assumptions: [what must be true for this to succeed]`;

const TECHNIQUE_PROMPTS = {
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

const VALID_TECHNIQUES = Object.keys(TECHNIQUE_PROMPTS);

// ── /api/optimize ───────────────────────────────────────────────────────────

app.post('/api/optimize', async (req, res) => {
  const { text, mode = 'speech', technique = 'auto' } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Text is required' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'OPENROUTER_API_KEY not set' });
  }

  // OPENROUTER_OPTIMIZER_MODEL takes precedence; falls back to OPENROUTER_MODEL
  const model =
    process.env.OPENROUTER_OPTIMIZER_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'anthropic/claude-haiku-4-5';

  // auto defaults to zero_shot — no extra classifier call needed
  const resolvedTechnique = VALID_TECHNIQUES.includes(technique) ? technique : 'zero_shot';
  const systemPrompt = TECHNIQUE_PROMPTS[resolvedTechnique];

  try {
    const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://venturelens.ai',
        'X-Title': 'VentureLens AI',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is the founder's raw idea:\n\n"${text}"` },
        ],
        max_tokens: 1024,
        temperature: 0.5,
      }),
    });

    if (!orResponse.ok) {
      const errText = await orResponse.text();
      console.error('OpenRouter optimize error:', errText);
      return res.status(orResponse.status).json({
        success: false,
        error: `AI service error (${orResponse.status}). Check your OPENROUTER_API_KEY.`,
      });
    }

    const orData = await orResponse.json();
    const optimizedText = orData.choices?.[0]?.message?.content?.trim() ?? text;
    const inputTokens = orData.usage?.prompt_tokens || 0;
    const outputTokens = orData.usage?.completion_tokens || 0;

    return res.json({
      success: true,
      originalText: text,
      optimizedText,
      mode,
      technique_used: resolvedTechnique,
      promptId: crypto.randomUUID(),
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    });
  } catch (error) {
    console.error('Optimize error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ── Venture analysis system prompt (mirrors api/venture-analyze.ts) ──────────

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

function getReportTypeInstruction(reportType) {
  const map = {
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

// ── /api/transcribe ─────────────────────────────────────────────────────────

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'DEEPGRAM_API_KEY not set' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No audio file provided' });
  }

  try {
    const dgResponse = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': req.file.mimetype || 'audio/webm',
        },
        body: req.file.buffer,
      }
    );

    if (!dgResponse.ok) {
      const err = await dgResponse.text();
      console.error('Deepgram error:', err);
      return res.status(dgResponse.status).json({ success: false, error: `Transcription failed (${dgResponse.status})` });
    }

    const dgData = await dgResponse.json();
    const transcript = dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    return res.json({ success: true, text: transcript });
  } catch (error) {
    console.error('Transcribe error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ── /api/venture-analyze ────────────────────────────────────────────────────

app.post('/api/venture-analyze', async (req, res) => {
  const { idea, reportType = 'auto' } = req.body;

  if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Idea is required' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'OPENROUTER_API_KEY not configured on server' });
  }

  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5';
  const trimmedIdea = idea.trim().slice(0, 1500);

  const reportTypeInstruction = getReportTypeInstruction(reportType);
  const systemPrompt = reportTypeInstruction
    ? `${VENTURE_SYSTEM_PROMPT}\n\nADDITIONAL FOCUS: ${reportTypeInstruction}`
    : VENTURE_SYSTEM_PROMPT;

  try {
    const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!orResponse.ok) {
      const errText = await orResponse.text();
      console.error('OpenRouter error:', errText);
      return res.status(orResponse.status).json({
        success: false,
        error: `AI service error (${orResponse.status}). Check your OPENROUTER_API_KEY.`,
      });
    }

    const orData = await orResponse.json();
    const rawContent = orData.choices?.[0]?.message?.content;

    if (!rawContent) {
      return res.status(500).json({ success: false, error: 'Empty response from AI service' });
    }

    let report;
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
          return res.status(422).json({ success: false, error: 'AI returned an unstructured response. Please try again.' });
        }
      } else {
        console.error('No JSON object found in response:', rawContent.slice(0, 200));
        return res.status(422).json({ success: false, error: 'AI returned an unstructured response. Please try again.' });
      }
    }

    return res.json({
      success: true,
      report,
      usage: {
        inputTokens: orData.usage?.prompt_tokens || 0,
        outputTokens: orData.usage?.completion_tokens || 0,
      },
    });
  } catch (error) {
    console.error('Venture analyze error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = 3001;
app.listen(PORT, () => console.log(`VentureLens dev server running on http://localhost:${PORT}`));
