export interface VentureReport {
  cleanedIdea: string;
  problemStatement: string;
  targetCustomer: string;
  valueProposition: string;
  keyAssumptions: string[];
  mainRisks: { risk: string; severity: 'High' | 'Medium' | 'Low' }[];
  mvpFeatures: string[];
  validationQuestions: string[];
  customerObjections: string[];
  scores: {
    desirability: { score: number; rationale: string };
    feasibility: { score: number; rationale: string };
    viability: { score: number; rationale: string };
    novelty: { score: number; rationale: string };
  };
  recommendation: 'Build' | 'Validate More' | 'Pivot' | 'Stop';
  recommendationReason: string;
}

export interface AnalyzeResult {
  report: VentureReport;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface OptimizeResult {
  optimizedText: string;
  techniqueUsed?: string;
}

export async function optimizeIdea(
  idea: string,
  technique = 'auto'
): Promise<{ data?: OptimizeResult; error?: string }> {
  try {
    const response = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: idea, mode: 'speech', technique }),
    })

    const json = await response.json().catch(() => ({})) as Record<string, unknown>

    if (!response.ok) {
      const msg = typeof json['error'] === 'string'
        ? json['error']
        : `Server error (${response.status})`
      return { error: msg }
    }

    const optimizedText =
      typeof json['optimizedText'] === 'string' ? json['optimizedText'] :
      typeof json['optimizedPrompt'] === 'string' ? json['optimizedPrompt'] :
      idea

    return {
      data: {
        optimizedText,
        techniqueUsed: typeof json['technique_used'] === 'string'
          ? json['technique_used']
          : undefined,
      },
    }
  } catch {
    return { error: 'Cannot reach server. Make sure it is running on port 3001.' }
  }
}

export async function analyzeIdea(
  idea: string,
  reportType = 'auto'
): Promise<{ data?: AnalyzeResult; error?: string }> {
  try {
    const response = await fetch('/api/venture-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea, reportType }),
    });

    const json = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      const msg = typeof json['error'] === 'string'
        ? json['error']
        : `Server error (${response.status})`;
      return { error: msg };
    }

    return {
      data: {
        report: json['report'] as VentureReport,
        usage: json['usage'] as AnalyzeResult['usage'],
      },
    };
  } catch {
    return { error: 'Cannot reach server. Make sure it is running on port 3001.' };
  }
}

export function formatReportAsText(report: VentureReport): string {
  const lines = [
    'VENTURELENS AI — VALIDATION REPORT',
    '',
    `CLEANED IDEA\n${report.cleanedIdea}`,
    '',
    `PROBLEM STATEMENT\n${report.problemStatement}`,
    '',
    `TARGET CUSTOMER\n${report.targetCustomer}`,
    '',
    `VALUE PROPOSITION\n${report.valueProposition}`,
    '',
    `KEY ASSUMPTIONS\n${report.keyAssumptions.map(a => `• ${a}`).join('\n')}`,
    '',
    `MAIN RISKS\n${report.mainRisks.map(r => `[${r.severity}] ${r.risk}`).join('\n')}`,
    '',
    `MVP FEATURES\n${report.mvpFeatures.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
    '',
    `VALIDATION QUESTIONS\n${report.validationQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
    '',
    `CUSTOMER OBJECTIONS\n${report.customerObjections.map(o => `"${o}"`).join('\n')}`,
    '',
    'SCORES',
    `Desirability: ${report.scores.desirability.score}/10 — ${report.scores.desirability.rationale}`,
    `Feasibility:  ${report.scores.feasibility.score}/10 — ${report.scores.feasibility.rationale}`,
    `Viability:    ${report.scores.viability.score}/10 — ${report.scores.viability.rationale}`,
    `Novelty:      ${report.scores.novelty.score}/10 — ${report.scores.novelty.rationale}`,
    '',
    `RECOMMENDATION: ${report.recommendation}\n${report.recommendationReason}`,
  ]
  return lines.join('\n')
}
