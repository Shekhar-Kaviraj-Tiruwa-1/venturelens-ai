# VentureLens AI

> Turn a rough spoken or typed business idea into a structured startup validation report in seconds.

**Live demo:** https://venturelens-ai-theta.vercel.app

---

## What it does

Most AI tools give encouraging, unstructured answers to "is my idea good?" VentureLens applies a real startup analysis framework — honest scores, key assumptions, main risks, MVP suggestions, customer objections, and a clear **Build / Validate More / Pivot / Stop** recommendation — in under 60 seconds, with no login required.

---

## System Architecture

```
Browser
  │
  ├─ Web Speech API ──────────────────────────────────────────────────┐
  │  (Chrome / Safari)                                                │ fallback
  │                                                               MediaRecorder
  │                                                                   │
  │                                                            POST /api/transcribe
  │                                                            Deepgram nova-2
  │                                                                   │
  ├─ POST /api/optimize ──────────────────────────────────────────────┘
  │  Raw idea → Business Idea Brief
  │  OpenRouter → OPENROUTER_OPTIMIZER_MODEL
  │  (defaults to anthropic/claude-haiku-4-5)
  │
  └─ POST /api/venture-analyze
     Business Brief (or raw idea) → VentureReport JSON
     OpenRouter → OPENROUTER_MODEL
     (defaults to anthropic/claude-haiku-4-5)

Production: Vercel Edge Functions  (api/*.ts)
Local dev:  Express mirror          (server.js, port 3001)
Frontend:   Vite SPA                (src/, port 5174, proxies /api → 3001)
```

---

## AI Pipeline

### Stage 1 — Prompt Optimization (optional)

The user selects a technique. The backend rewrites the raw idea into a structured **Business Idea Brief** — not a generic AI prompt, but a clean description the validator can actually use.

| Technique | What it does |
|---|---|
| `auto` | Defaults to `zero_shot` — no extra classifier call |
| `zero_shot` | Directly extracts Idea / Customer / Problem / Solution / Value Prop / Assumptions |
| `few_shot` | Uses a guitar-teacher matching example to anchor the output format |
| `system_user` | Frames the brief from a senior business analyst persona |
| `context_efficient` | Compressed brief — 1–2 sentences per field |
| `chain_of_thought` | Model reasons internally; outputs only the final clean brief (no visible steps) |

Model: `OPENROUTER_OPTIMIZER_MODEL` → `OPENROUTER_MODEL` → `anthropic/claude-haiku-4-5`

### Stage 2 — Business Validation

The brief (or original idea if optimization was skipped) is sent to `/api/venture-analyze` with a chosen report type. The system prompt enforces a strict JSON schema — no prose, no markdown fences — and instructs the model to score conservatively and surface real risks.

**7 report types:** Auto · Lean Canvas · Customer Discovery · MVP Plan · Investor Pitch Review · Risk & Assumption Check · Market Validation

Each type appends a focused instruction to the base system prompt (e.g. "Evaluate from an investor lens: market size, defensibility, revenue model").

**Output — `VentureReport` (typed contract between backend and frontend):**

```typescript
{
  cleanedIdea: string
  problemStatement: string
  targetCustomer: string
  valueProposition: string
  keyAssumptions: string[]                              // 3–5 items
  mainRisks: { risk: string; severity: 'High' | 'Medium' | 'Low' }[]  // exactly 3
  mvpFeatures: string[]                                // 3–5 items
  validationQuestions: string[]                        // exactly 5
  customerObjections: string[]                         // exactly 3
  scores: {
    desirability: { score: number; rationale: string } // 1–10
    feasibility:  { score: number; rationale: string }
    viability:    { score: number; rationale: string }
    novelty:      { score: number; rationale: string }
  }
  recommendation: 'Build' | 'Validate More' | 'Pivot' | 'Stop'
  recommendationReason: string                         // exactly 2 sentences
}
```

---

## Reliability Engineering

**JSON parsing — 3-stage extraction:**
1. `JSON.parse(rawContent)` — succeeds when the model behaves correctly
2. Strip markdown fences (` ```json `) → parse again
3. Regex-extract the first `{...}` block → parse again
4. If all three fail: return a valid fallback `VentureReport` (placeholder content, never a crash)

**Timeout — AbortController at 25s:**
Both Edge Functions attach an `AbortController` to the OpenRouter `fetch`. If the model is slow, the request aborts cleanly and returns a `503` with a user-readable message instead of a Vercel `504`.

**Speech recognition — dual fallback:**
1. `window.SpeechRecognition` / `webkitSpeechRecognition` (Chrome, Safari)
2. `MediaRecorder` → POST audio blob → `/api/transcribe` → Deepgram nova-2 (Firefox, non-Chrome)

---

## API Contracts

### `POST /api/optimize`
```json
// Request
{ "text": "string", "technique": "auto|zero_shot|few_shot|system_user|context_efficient|chain_of_thought", "mode": "speech|text" }

// Response
{ "success": true, "optimizedText": "string", "technique_used": "string", "usage": { "inputTokens": 0, "outputTokens": 0 } }
```

### `POST /api/venture-analyze`
```json
// Request
{ "idea": "string", "reportType": "auto|lean_canvas|customer_discovery|mvp_plan|investor_pitch|risk_assumption|market_validation" }

// Response
{ "success": true, "report": { /* VentureReport */ }, "usage": { "inputTokens": 0, "outputTokens": 0 } }
```

### `POST /api/transcribe`
```
// Request: multipart/form-data, field "audio" (audio/webm blob)
// Response: { "success": true, "text": "string" }
```

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS | Single component `src/App.tsx`, `@/` alias to `src/` |
| UI primitives | shadcn/ui (Radix + CVA) | Button, Card, Textarea |
| Prompt optimization | OpenRouter → Claude Haiku | Configurable via `OPENROUTER_OPTIMIZER_MODEL` |
| Business validation | OpenRouter → Claude Haiku | Configurable via `OPENROUTER_MODEL`; structured JSON output enforced |
| Voice (primary) | Web Speech API | Browser-native, no API key needed |
| Voice (fallback) | Deepgram nova-2 | Used when Web Speech API is blocked or unavailable |
| Edge Functions | Vercel (Edge runtime) | `api/optimize.ts`, `api/transcribe.ts`, `api/venture-analyze.ts` |
| Local dev server | Express 5 + Multer | `server.js` mirrors all three Edge Functions on port 3001 |

---

## Local Development

### Prerequisites

- Node 18+
- Two terminal windows

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in OPENROUTER_API_KEY (required). DEEPGRAM_API_KEY is optional.

# 3. Terminal 1 — API server (port 3001)
node server.js

# 4. Terminal 2 — Vite frontend (port 5174)
npm run dev
```

Open `http://localhost:5174`.

Vite proxies all `/api/*` requests to `http://localhost:3001`. The Express server (`server.js`) mirrors the Vercel Edge Functions exactly — same prompts, same logic.

**Chrome microphone note:** Microphone permission is scoped per port. If blocked, check site settings for `localhost:5174`.

---

## Production Deployment (Vercel)

```bash
# Deploy to production
npx vercel --prod
```

Set these environment variables in the Vercel dashboard (Settings → Environment Variables):

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Used by both `/api/optimize` and `/api/venture-analyze` |
| `OPENROUTER_MODEL` | No | Validation model (default: `anthropic/claude-haiku-4-5`) |
| `OPENROUTER_OPTIMIZER_MODEL` | No | Optimization model; falls back to `OPENROUTER_MODEL` |
| `DEEPGRAM_API_KEY` | No | Required only if voice fallback transcription is needed |

---

## Project Structure

```
venturelens-ai/
├── api/
│   ├── optimize.ts          # POST /api/optimize  — Business Idea Brief generation
│   ├── transcribe.ts        # POST /api/transcribe — Deepgram voice fallback
│   └── venture-analyze.ts   # POST /api/venture-analyze — VentureReport generation
├── src/
│   ├── components/ui/       # Button, Card, Textarea (shadcn/ui)
│   ├── hooks/
│   │   └── useSpeechRecognition.ts  # Web Speech API + MediaRecorder fallback
│   ├── services/
│   │   └── ventureLensAI.ts         # API client + VentureReport type definition
│   └── App.tsx              # Full application (single component)
├── server.js                # Local Express mirror of api/ (port 3001)
├── vercel.json              # Build config + SPA rewrite rule
└── .env.example
```

> **Note on intentional duplication:** `TECHNIQUE_PROMPTS`, `VENTURE_SYSTEM_PROMPT`, and `getReportTypeInstruction()` are duplicated between `server.js` and the corresponding `api/` files. This keeps each Vercel Edge Function self-contained with no shared module dependencies. If you change a prompt in one, update the other.
