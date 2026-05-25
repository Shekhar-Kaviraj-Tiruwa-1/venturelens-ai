# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This is the standalone **VentureLens AI** repository. It is a self-contained project and has no dependency on any other repository (including the old Voice Prompt Optimizer repo).

## Commands

```bash
# Start local API server (port 3001) — required for any AI features
node server.js
# or equivalently:
npm run server

# Start frontend (port 5174)
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

Both `npm run dev` and `node server.js` must run simultaneously during local development. The Vite dev server proxies all `/api/*` requests to `http://localhost:3001`.

## Environment variables

**Safety rules:**
- Never commit `.env` or `.env.local` — they must stay local only.
- Only `.env.example` (with blank values) should be committed.
- Never print or expose API key values in code, logs, or output.
- All API keys must live on the backend only (`server.js` / Vercel Edge Functions). No key is ever sent to the frontend or included in the Vite bundle.

Copy `.env.example` to `.env` before running the local server:

```
OPENROUTER_API_KEY=          # required — for both /api/optimize and /api/venture-analyze
OPENROUTER_MODEL=            # optional; defaults to anthropic/claude-sonnet-4-5
OPENROUTER_OPTIMIZER_MODEL=  # optional; overrides model for /api/optimize only
DEEPGRAM_API_KEY=            # optional; for /api/transcribe (voice fallback only)
```

## Core user flow

1. User speaks or types a business idea.
2. (Optional) User clicks **Optimize Idea Prompt** — selects a technique (Auto, Zero-Shot, Few-Shot, System/User, Context-Efficient, Chain-of-Thought). The backend rewrites the raw idea into a structured **Business Idea Brief**.
3. User can edit the optimized brief before proceeding.
4. User selects a report type and clicks **Generate Validation Report**.
5. If an optimized brief exists, it is sent to `/api/venture-analyze`; otherwise the original idea is used.
6. The rendered report header shows both the source (Optimized Prompt or Original Idea) and the report type.

## Architecture

**Dual-server setup:**
- **Frontend**: React 19 + Vite SPA (`src/`). Single component in `src/App.tsx`.
- **Local backend**: Express server (`server.js`, port 3001) — mirrors the Vercel functions for local dev.
- **Production backend**: Vercel Edge Functions (`api/`) — each file is one route.

**Intentional duplication:** `TECHNIQUE_PROMPTS` is duplicated between `server.js` and `api/optimize.ts`. `VENTURE_SYSTEM_PROMPT` and `getReportTypeInstruction()` are duplicated between `server.js` and `api/venture-analyze.ts`. This keeps each Vercel function self-contained. If you change prompts or logic in one, update the other.

**Three API endpoints:**

| Route | Handler | AI service |
|---|---|---|
| `POST /api/optimize` | `api/optimize.ts` / `server.js` | OpenRouter (`OPENROUTER_OPTIMIZER_MODEL` → `OPENROUTER_MODEL` → `anthropic/claude-haiku-4-5`) |
| `POST /api/transcribe` | `api/transcribe.ts` / `server.js` | Deepgram REST API |
| `POST /api/venture-analyze` | `api/venture-analyze.ts` / `server.js` | OpenRouter (`anthropic/claude-sonnet-4-5` by default) |

**`/api/optimize` output contract:** Always returns plain text in `optimizedText` — a business brief describing the idea, not instructions for another AI. All five `TECHNIQUE_PROMPTS` are written to enforce this. `auto` defaults to `zero_shot` with no extra classifier call. Do not change the prompts to produce generic prompt-engineering output.

**`/api/venture-analyze` JSON reliability:** The system prompt instructs the model to return raw JSON only (starts with `{`, ends with `}`). If direct `JSON.parse` fails, both handlers attempt to extract a `{...}` block via regex before returning an error.

**Speech recognition fallback chain** (`src/hooks/useSpeechRecognition.ts`):
1. Tries browser Web Speech API (`window.SpeechRecognition` / `window.webkitSpeechRecognition`)
2. On network error or unavailability, falls back to `MediaRecorder` recording + `POST /api/transcribe` → Deepgram

## Key types

`VentureReport` in `src/services/ventureLensAI.ts` is the single source of truth for the shape of AI analysis output. The Vercel functions and Express server both produce this shape; `App.tsx` renders it. If you change the schema, update the system prompt in both `api/venture-analyze.ts` and `server.js`.

## Path alias

`@/` resolves to `src/` (configured in `vite.config.ts` and `tsconfig.app.json`).
