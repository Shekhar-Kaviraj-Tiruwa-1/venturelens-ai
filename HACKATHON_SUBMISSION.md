# VentureLens AI — Hackathon Submission

## What it does

VentureLens AI turns a rough business idea — spoken out loud or typed — into a structured validation report in seconds. Instead of a generic AI chat, it applies a full startup analysis framework: honest scores, key assumptions, main risks, MVP feature suggestions, customer objections, and a clear recommendation to Build, Validate More, Pivot, or Stop.

The prompt optimization layer (built in, not external) rewrites the user's raw idea using techniques like Chain-of-Thought or Zero-Shot before it reaches the validator — making the report sharper without requiring the user to be a prompt engineer.

---

## The Problem

Most founders validate ideas by asking friends or running a quick Google search. Neither surfaces hard truths. AI chatbots give encouraging, unstructured answers. There is no fast, structured, voice-first tool that gives founders an honest framework in under 60 seconds.

---

## How It Works

1. **Speak or type** a rough idea — as messy and unpolished as you like
2. **(Optional) Optimize the prompt** — choose a technique (Auto, Zero-Shot, Few-Shot, System/User, Context-Efficient, Chain-of-Thought); the AI rewrites the idea into a structured prompt
3. **Edit** the optimized prompt if needed
4. **Choose a report type** — Auto, Lean Canvas, Customer Discovery, MVP Plan, Investor Pitch Review, Risk & Assumption Check, or Market Validation
5. **Generate** — an 11-section validation report appears in seconds

The report always shows which source was used (Optimized Prompt or Original Idea) so the user knows exactly what was analyzed.

---

## Track

Business idea validation / Startup tooling

---

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS |
| Voice input | Web Speech API (Chrome primary), Deepgram nova-2 (fallback) |
| Prompt optimization | OpenRouter (configurable model, defaults to Claude Haiku) |
| Business validation | OpenRouter → Claude Sonnet via structured JSON output |
| Hosting | Vercel (Edge serverless functions) |

---

## What makes it different

- **Voice-first** — designed around speaking ideas, not typing them
- **Prompt optimization is part of the validation flow** — not a separate tool
- **Honest, not encouraging** — the system prompt explicitly instructs the model to surface risks and score conservatively
- **7 report modes** — same idea, different analytical lenses depending on where the founder is in their journey
- **No login, no signup** — open the URL and start talking

---

## Demo Flow

1. Open the app
2. Click a demo idea (or speak your own)
3. Select technique: Chain-of-Thought
4. Click "Optimize Idea Prompt"
5. Select report type: Investor Pitch Review
6. Click "Generate Report from Optimized Prompt"
7. Read the 11-section report — note the recommendation, scores, and risks
8. Click "Copy Report" — paste into any doc

Total time: under 60 seconds.
