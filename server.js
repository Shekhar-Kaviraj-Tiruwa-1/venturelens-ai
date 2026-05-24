// Local development server — mirrors the Vercel API functions at localhost:3001
// Run with: node server.js
// Requires Node 18+ (uses native fetch)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

// ── Prompt technique templates (mirrors api/optimize.ts) ────────────────────

const CLASSIFIER_PROMPT = `You are a prompt engineering classifier. Analyze the user's input and determine which single technique will produce the best result.

Techniques:
- zero_shot: Best for clear, direct tasks that need no examples (summaries, explanations, simple instructions)
- few_shot: Best for tasks where pattern/format must be consistent (formatting, classification, transformation)
- system_user: Best for tasks requiring a specific persona or role-play (customer service, expert advisor, character)
- context_efficient: Best for simple or repetitive tasks where brevity matters (quick lookups, short answers)
- chain_of_thought: Best for complex reasoning, math, multi-step problems, or analysis

Return ONLY one word — exactly one of: zero_shot, few_shot, system_user, context_efficient, chain_of_thought

No explanation. No punctuation. Just the technique name.`;

const TECHNIQUE_PROMPTS = {
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

const VALID_TECHNIQUES = Object.keys(TECHNIQUE_PROMPTS);

// ── Venture analysis system prompt (mirrors api/venture-analyze.ts) ──────────

const VENTURE_SYSTEM_PROMPT = `You are a seasoned business analyst and startup advisor. Give founders an honest, structured validation of their business idea. You are NOT a cheerleader — surface real risks, hard questions, and honest scores.

Return ONLY a valid JSON object. No text before or after. No markdown fences. Pure JSON matching this exact schema:

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

// ── /api/optimize ───────────────────────────────────────────────────────────

app.post('/api/optimize', async (req, res) => {
  const { text, mode = 'speech', technique = 'auto' } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Text is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not set' });
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    let resolvedTechnique;
    if (technique === 'auto') {
      const classifierMsg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        system: CLASSIFIER_PROMPT,
        messages: [{ role: 'user', content: text }],
      });
      const raw = classifierMsg.content[0]?.type === 'text'
        ? classifierMsg.content[0].text.trim().toLowerCase()
        : 'zero_shot';
      resolvedTechnique = VALID_TECHNIQUES.includes(raw) ? raw : 'zero_shot';
    } else {
      resolvedTechnique = VALID_TECHNIQUES.includes(technique) ? technique : 'zero_shot';
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: TECHNIQUE_PROMPTS[resolvedTechnique],
      messages: [{ role: 'user', content: `Optimize this request:\n\n"${text}"` }],
    });

    const optimizedText = message.content[0]?.type === 'text' ? message.content[0].text.trim() : text;

    return res.json({
      success: true,
      originalText: text,
      optimizedText,
      mode,
      technique_used: resolvedTechnique,
      promptId: crypto.randomUUID(),
      usage: {
        inputTokens: message.usage?.input_tokens || 0,
        outputTokens: message.usage?.output_tokens || 0,
      },
    });
  } catch (error) {
    console.error('Optimize error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

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
      console.error('Failed to parse AI JSON:', rawContent.slice(0, 300));
      return res.status(422).json({ success: false, error: 'AI returned an unstructured response. Please try again.' });
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
