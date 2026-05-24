# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start frontend (port 5174)
npm run dev

# Start local API server (port 3001) — required for any AI features
node server.js
# or equivalently:
npm run server

# Build for production
npm run build

# Lint
npm run lint
```

Both `npm run dev` and `npm run server` must run simultaneously during local development. The Vite dev server proxies all `/api/*` requests to `http://localhost:3001`.

## Architecture

**Dual-server setup:**
- **Frontend**: React 19 + Vite SPA (`src/`). Single component in `src/App.tsx`.
- **Local backend**: Express server (`server.js`, port 3001) — mirrors the Vercel functions for local dev.
- **Production backend**: Vercel Edge Functions (`api/`) — each file maps to a route (`api/optimize.ts` → `POST /api/optimize`, etc.).

The system prompts and `getReportTypeInstruction()` logic are intentionally duplicated between `server.js` and `api/venture-analyze.ts` to keep each Vercel function self-contained.

**Three API endpoints:**

| Route | Handler | AI service |
|---|---|---|
| `POST /api/optimize` | `api/optimize.ts` / `server.js` | Anthropic SDK (`claude-haiku-4-5` for classifier, `claude-sonnet-4-6` for optimization) |
| `POST /api/transcribe` | `api/transcribe.ts` / `server.js` | Deepgram REST API |
| `POST /api/venture-analyze` | `api/venture-analyze.ts` / `server.js` | OpenRouter (`anthropic/claude-sonnet-4-5` by default) |

**Frontend data flow:**
1. User provides idea via speech (Web Speech API with Deepgram recording fallback) or text input.
2. Optional: `optimizeIdea()` in `src/services/ventureLensAI.ts` calls `/api/optimize`, which classifies the idea's technique (auto-selected or user-chosen) then rewrites the prompt.
3. `analyzeIdea()` calls `/api/venture-analyze` with the (optionally optimized) idea and report type. Returns a `VentureReport` object rendered in `App.tsx`.

**Speech recognition fallback chain** (`src/hooks/useSpeechRecognition.ts`):
1. Tries browser Web Speech API (`window.SpeechRecognition` / `window.webkitSpeechRecognition`)
2. On network error or unavailability, falls back to recording via `MediaRecorder` + `POST /api/transcribe` → Deepgram

## Environment variables

**Never commit `.env` or `.env.local`** — they must stay local only. Only `.env.example` (with blank values) should be committed. Never print or expose API key values in code, logs, or output.

Copy `.env.example` to `.env` before running the local server:

```
ANTHROPIC_API_KEY=       # for /api/optimize
OPENROUTER_API_KEY=      # for /api/venture-analyze
OPENROUTER_MODEL=        # optional; defaults to anthropic/claude-sonnet-4-5
DEEPGRAM_API_KEY=        # for /api/transcribe (speech fallback only)
```

## Key types

`VentureReport` in `src/services/ventureLensAI.ts` is the single source of truth for the shape of AI analysis output. The Vercel functions and Express server both produce this shape; `App.tsx` renders it. If you change the schema, update the system prompt in both `api/venture-analyze.ts` and `server.js`.

## Path alias

`@/` resolves to `src/` (configured in `vite.config.ts` and `tsconfig.app.json`).
