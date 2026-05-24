# VentureLens AI

Turn a rough business idea — spoken or typed — into a structured validation report in seconds.

VentureLens AI is a voice-first hackathon project that combines prompt engineering with business analysis. Speak or type your idea, optionally optimize the prompt using one of five techniques, then generate a detailed validation report covering risks, target customers, MVP features, and an honest recommendation.

---

## Features

- **Voice or text input** — Web Speech API primary, Deepgram fallback for non-Chrome browsers
- **Prompt Optimization Built In** — choose Auto, Zero-Shot, Few-Shot, System/User, Context-Efficient, or Chain-of-Thought before running analysis
- **Editable optimized prompt** — review and tweak the AI-rewritten idea before validating
- **7 Report Types** — Auto, Lean Canvas, Customer Discovery, MVP Plan, Investor Pitch Review, Risk & Assumption Check, Market Validation
- **11-section validation report** — problem statement, target customer, value proposition, key assumptions, risks, MVP features, validation questions, customer objections, scores, and recommendation
- **Report source tracking** — the report header always shows whether it used your original idea or the optimized prompt
- **Copy to clipboard** — plain-text export of the full report

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Prompt optimization | Anthropic Claude Haiku (classifier) + Claude Sonnet (optimizer) |
| Business validation | OpenRouter → Claude Sonnet |
| Voice fallback | Deepgram nova-2 |
| Production hosting | Vercel (Edge functions) |

---

## Local Development

### Prerequisites

- Node 18+
- Two terminal windows

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

```
OPENROUTER_API_KEY=your_openrouter_key_here      # required — for validation reports
ANTHROPIC_API_KEY=your_anthropic_key_here        # required — for prompt optimization
DEEPGRAM_API_KEY=your_deepgram_key_here          # optional — only needed for voice fallback
OPENROUTER_MODEL=                                # optional — defaults to anthropic/claude-sonnet-4-5
```

### 3. Start the dev server

```bash
# Terminal 1 — API server (port 3001)
node server.js

# Terminal 2 — Vite frontend (port 5174)
npm run dev
```

Open `http://localhost:5174`.

**Browser microphone note:** Chrome requires microphone permission to be granted per port. If you get a "Microphone access denied" error, check your browser's site settings for `localhost:5174`.

---

## Production Deployment (Vercel)

1. Push to GitHub
2. Import the repo in Vercel
3. Add environment variables in the Vercel dashboard:
   - `OPENROUTER_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `DEEPGRAM_API_KEY` (optional)
4. Deploy — Vercel auto-detects Vite and the `api/` serverless functions

---

## Project Structure

```
venturelens-ai/
├── api/
│   ├── optimize.ts          # Prompt optimization (Anthropic, Edge runtime)
│   ├── transcribe.ts        # Voice transcription (Deepgram, Edge runtime)
│   └── venture-analyze.ts   # Validation report (OpenRouter, Edge runtime)
├── src/
│   ├── components/ui/       # shadcn Button, Card, Textarea
│   ├── hooks/               # useSpeechRecognition
│   ├── services/            # ventureLensAI.ts — API call helpers
│   ├── App.tsx              # Main application
│   └── main.tsx
├── server.js                # Local dev Express server (mirrors api/ functions)
├── vercel.json              # Vercel deployment config
└── .env.example
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for validation reports |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for prompt optimization |
| `DEEPGRAM_API_KEY` | Optional | Deepgram API key for voice transcription fallback |
| `OPENROUTER_MODEL` | Optional | Override the OpenRouter model (default: `anthropic/claude-sonnet-4-5`) |
