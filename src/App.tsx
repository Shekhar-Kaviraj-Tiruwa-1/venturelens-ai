import { useState } from 'react'
import { toast, Toaster } from 'sonner'
import {
  Mic,
  MicOff,
  Volume2,
  Type,
  Sparkles,
  Loader2,
  Zap,
  Wand2,
  AlertTriangle,
  Copy,
  RotateCcw,
  Users,
  Target,
  Lightbulb,
  CheckSquare,
  MessageSquare,
  Star,
  TrendingUp,
  X,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import {
  analyzeIdea,
  optimizeIdea,
  formatReportAsText,
  type VentureReport,
} from '@/services/ventureLensAI'
import './App.css'

const MAX_CHARS = 1500

const DEMO_IDEAS = [
  'An app that connects freelance chefs with busy professionals who want home-cooked meals delivered weekly on subscription.',
  'A subscription box for sustainable office supplies made from recycled materials, curated for remote workers.',
  'A voice-based journaling app that transcribes speech and surfaces weekly mood and mental health insights.',
]

const TECHNIQUES = [
  { value: 'auto',              label: 'Auto' },
  { value: 'zero_shot',        label: 'Zero-Shot' },
  { value: 'few_shot',         label: 'Few-Shot' },
  { value: 'system_user',      label: 'System / User' },
  { value: 'context_efficient', label: 'Context-Efficient' },
  { value: 'chain_of_thought', label: 'Chain-of-Thought' },
]

const REPORT_TYPES = [
  { value: 'auto',                label: 'Auto Report' },
  { value: 'lean_canvas',        label: 'Lean Canvas' },
  { value: 'customer_discovery', label: 'Customer Discovery' },
  { value: 'mvp_plan',           label: 'MVP Plan' },
  { value: 'investor_pitch',     label: 'Investor Pitch Review' },
  { value: 'risk_assumption',    label: 'Risk & Assumption Check' },
  { value: 'market_validation',  label: 'Market Validation' },
]

const RECOMMENDATION_STYLE: Record<
  VentureReport['recommendation'],
  { border: string; text: string; bg: string }
> = {
  Build:           { border: 'border-green-500/30',  text: 'text-green-400',  bg: 'bg-green-500/10' },
  'Validate More': { border: 'border-yellow-500/30', text: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  Pivot:           { border: 'border-orange-500/30', text: 'text-orange-400', bg: 'bg-orange-500/10' },
  Stop:            { border: 'border-red-500/30',    text: 'text-red-400',    bg: 'bg-red-500/10' },
}

const SELECT_CLS =
  'bg-slate-800/80 border border-white/10 text-slate-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/50 cursor-pointer hover:border-white/20 transition-colors'

function scoreColor(score: number) {
  if (score >= 7) return 'text-green-400 border-green-500/30 bg-green-500/10'
  if (score >= 5) return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
  return 'text-red-400 border-red-500/30 bg-red-500/10'
}

function severityColor(severity: string) {
  if (severity === 'High')   return 'text-red-400 border-red-500/30 bg-red-500/10'
  if (severity === 'Medium') return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
  return 'text-green-400 border-green-500/30 bg-green-500/10'
}

function ReportSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <CardTitle className="text-white flex items-center gap-2 text-sm">
          <span className="text-amber-400">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default function App() {
  const [inputMode, setInputMode] = useState<'speech' | 'text'>('speech')
  const [manualText, setManualText] = useState('')
  const [technique, setTechnique] = useState('auto')
  const [reportType, setReportType] = useState('auto')
  const [optimizedIdea, setOptimizedIdea] = useState('')
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [report, setReport] = useState<VentureReport | null>(null)
  const [reportSource, setReportSource] = useState<'optimized' | 'original' | null>(null)
  const [reportTypeName, setReportTypeName] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const {
    transcript,
    isListening,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
    supported,
  } = useSpeechRecognition()

  const ideaText = inputMode === 'speech' ? transcript : manualText
  const hasIdea = ideaText.trim().length > 0
  const hasOptimized = optimizedIdea.trim().length > 0

  const switchMode = (mode: 'speech' | 'text') => {
    setInputMode(mode)
    if (isListening) stopListening()
    setOptimizedIdea('')
    setOptimizeError(null)
    setReport(null)
    setReportSource(null)
    setReportTypeName(null)
    setAnalysisError(null)
  }

  const toggleListening = () => {
    if (isListening) stopListening()
    else startListening()
  }

  const handleOptimize = async () => {
    if (!hasIdea || isOptimizing || isLoading) return
    setIsOptimizing(true)
    setOptimizeError(null)
    setOptimizedIdea('')

    const { data, error: err } = await optimizeIdea(
      ideaText.trim().slice(0, MAX_CHARS),
      technique
    )
    setIsOptimizing(false)

    if (err) {
      setOptimizeError(err)
      toast.error(err)
      return
    }

    if (data) {
      setOptimizedIdea(data.optimizedText)
      const techLabel = TECHNIQUES.find(t => t.value === (data.techniqueUsed ?? technique))?.label ?? technique
      toast.success(`Idea optimized using ${techLabel}. Edit if needed, then generate the report.`)
    }
  }

  const handleGenerate = async () => {
    const usingOptimized = hasOptimized
    const ideaForAnalysis = usingOptimized ? optimizedIdea.trim() : ideaText.trim()
    if (!ideaForAnalysis || isLoading || isOptimizing) return
    setIsLoading(true)
    setAnalysisError(null)
    setReport(null)
    setReportSource(null)
    setReportTypeName(null)

    const { data, error: err } = await analyzeIdea(
      ideaForAnalysis.slice(0, MAX_CHARS),
      reportType
    )
    setIsLoading(false)

    if (err) {
      setAnalysisError(err)
      toast.error(err)
      return
    }

    if (data) {
      setReport(data.report)
      setReportSource(usingOptimized ? 'optimized' : 'original')
      setReportTypeName(REPORT_TYPES.find(r => r.value === reportType)?.label ?? 'Auto Report')
      toast.success('Validation report ready.')
    }
  }

  const handleClear = () => {
    resetTranscript()
    setManualText('')
    setOptimizedIdea('')
    setOptimizeError(null)
    setReport(null)
    setReportSource(null)
    setReportTypeName(null)
    setAnalysisError(null)
  }

  const handleDemoIdea = (demo: string) => {
    if (isListening) stopListening()
    setInputMode('text')
    setManualText(demo)
    setOptimizedIdea('')
    setOptimizeError(null)
    setReport(null)
    setReportSource(null)
    setReportTypeName(null)
    setAnalysisError(null)
  }

  const recStyle = report ? RECOMMENDATION_STYLE[report.recommendation] : null

  // Source badge shown near the Generate button
  const sourceBadge = (
    <span
      className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
        hasOptimized
          ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
          : 'bg-white/5 border-white/10 text-slate-500'
      }`}
    >
      {hasOptimized ? '✦ Optimized Prompt' : 'Original Idea'}
    </span>
  )

  // Controls rendered in both speech transcript area and text mode card
  const ActionControls = (
    <div className="space-y-3">
      {/* Row 1: technique selector + optimize button */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <label className="text-xs text-slate-400 shrink-0 whitespace-nowrap">Technique:</label>
          <select
            value={technique}
            onChange={e => setTechnique(e.target.value)}
            className={SELECT_CLS}
          >
            {TECHNIQUES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1" />
        <Button
          variant="outline"
          onClick={handleOptimize}
          disabled={!hasIdea || isOptimizing || isLoading}
          className="border-white/20 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
        >
          {isOptimizing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Optimizing idea...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              Optimize Idea Prompt
            </>
          )}
        </Button>
      </div>

      {/* Row 2: report type selector + source badge + generate button */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <label className="text-xs text-slate-400 shrink-0 whitespace-nowrap">Report:</label>
          <select
            value={reportType}
            onChange={e => setReportType(e.target.value)}
            className={SELECT_CLS}
          >
            {REPORT_TYPES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        {hasIdea && sourceBadge}
        <div className="flex-1" />
        <Button
          onClick={handleGenerate}
          disabled={!(hasIdea || hasOptimized) || isLoading || isOptimizing}
          className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white border-0 shrink-0"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating report...
            </>
          ) : hasOptimized ? (
            <>
              <Zap className="w-4 h-4" />
              Generate Report from Optimized Prompt
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Generate Validation Report
            </>
          )}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <Toaster theme="dark" position="top-right" />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/50 border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                VentureLens AI
              </h1>
              <p className="text-xs text-slate-400">
                Turn rough voice or text ideas into business validation reports.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 bg-white/5 px-3 py-1.5 rounded-full">
            <Wand2 className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">Prompt Optimization Built In</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* Mode Switcher */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-white/5 rounded-full p-1 border border-white/10">
            <button
              onClick={() => switchMode('speech')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                inputMode === 'speech'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              Speech
            </button>
            <button
              onClick={() => switchMode('text')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                inputMode === 'text'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Type className="w-4 h-4" />
              Text
            </button>
          </div>
        </div>

        {/* Demo ideas */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {DEMO_IDEAS.map((demo, i) => (
            <button
              key={i}
              onClick={() => handleDemoIdea(demo)}
              className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              Demo {i + 1}
            </button>
          ))}
          <span className="text-xs text-slate-600 self-center">← click to try a sample idea</span>
        </div>

        {/* Speech recognition error */}
        {speechError && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
            <X className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{speechError}</p>
          </div>
        )}

        {/* ── Speech Mode ── */}
        {inputMode === 'speech' && (
          <>
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm mb-6">
              <CardContent className="p-8">
                <div className="flex flex-col items-center">
                  <button
                    onClick={toggleListening}
                    disabled={!supported}
                    className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isListening
                        ? 'bg-gradient-to-br from-red-500 to-pink-600 shadow-lg shadow-red-500/40 scale-110'
                        : 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25 hover:scale-105'
                    } ${!supported ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isListening ? (
                      <MicOff className="w-12 h-12 text-white" />
                    ) : (
                      <Mic className="w-12 h-12 text-white" />
                    )}
                    {isListening && (
                      <>
                        <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
                        <span className="absolute -inset-4 rounded-full bg-red-500/10 animate-pulse" />
                      </>
                    )}
                  </button>
                  <p className="mt-6 text-lg font-medium text-white">
                    {isListening ? 'Listening...' : 'Tap to speak your idea'}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    {isListening
                      ? 'Describe your business idea out loud...'
                      : 'Click the microphone button to start'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Transcript card + action controls */}
            {transcript && !isListening && (
              <>
                <Card className="bg-white/5 border-white/10 backdrop-blur-sm mb-4">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2">
                      <Volume2 className="w-5 h-5 text-slate-400" />
                      Transcribed Idea
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClear}
                      className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 rounded-lg bg-slate-800/60 border border-white/10">
                      <p className="text-white whitespace-pre-wrap leading-relaxed">{transcript}</p>
                    </div>
                  </CardContent>
                </Card>
                <div className="mb-6">{ActionControls}</div>
              </>
            )}
          </>
        )}

        {/* ── Text Mode ── */}
        {inputMode === 'text' && (
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm mb-6">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Type className="w-5 h-5 text-amber-400" />
                Describe Your Business Idea
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value.slice(0, MAX_CHARS))}
                  placeholder="Type your business idea here... Be as rough as you like. VentureLens will validate it."
                  className="min-h-[150px] bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none focus:border-amber-500/50 focus:ring-amber-500/20 pr-16"
                />
                <span
                  className={`absolute bottom-2 right-3 text-xs pointer-events-none ${
                    manualText.length >= MAX_CHARS ? 'text-red-400' : 'text-slate-600'
                  }`}
                >
                  {manualText.length}/{MAX_CHARS}
                </span>
              </div>
              {ActionControls}
            </CardContent>
          </Card>
        )}

        {/* Optimize error */}
        {optimizeError && !isOptimizing && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Optimization failed</p>
              <p className="text-xs mt-0.5 text-red-400/80">{optimizeError}</p>
            </div>
          </div>
        )}

        {/* Optimized idea card */}
        {hasOptimized && (
          <Card className="bg-gradient-to-br from-indigo-950/50 to-purple-950/50 border-indigo-500/30 backdrop-blur-sm mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Wand2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-white">Optimized Idea Prompt</CardTitle>
                  <p className="text-xs text-indigo-400 mt-0.5">
                    Edit if needed — this will be used for the validation report
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setOptimizedIdea(''); setOptimizeError(null) }}
                className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea
                value={optimizedIdea}
                onChange={(e) => setOptimizedIdea(e.target.value)}
                className="min-h-[240px] bg-slate-950/50 border-indigo-500/20 text-slate-200 leading-relaxed resize-y focus:border-indigo-500/50 focus:ring-indigo-500/20 text-sm"
              />
            </CardContent>
          </Card>
        )}

        {/* Analysis error */}
        {analysisError && !isLoading && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Validation failed</p>
              <p className="text-xs mt-0.5 text-red-400/80">{analysisError}</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm mb-6">
            <CardContent className="py-10 flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
              <p className="text-white font-medium text-sm">Running validation framework...</p>
              <p className="text-slate-500 text-xs">Usually takes 5–10 seconds</p>
            </CardContent>
          </Card>
        )}

        {/* ── Validation Report ── */}
        {report && !isLoading && recStyle && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">Validation Report</h2>
                {/* Report meta badges */}
                {reportTypeName && reportTypeName !== 'Auto Report' && (
                  <span className="text-xs px-2.5 py-1 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-300 font-medium flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {reportTypeName}
                  </span>
                )}
                {reportSource && (
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                    reportSource === 'optimized'
                      ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                      : 'bg-white/5 border-white/10 text-slate-400'
                  }`}>
                    {reportSource === 'optimized' ? '✦ Optimized Prompt' : 'Original Idea'}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(formatReportAsText(report))
                  toast.success('Report copied to clipboard.')
                }}
                className="text-slate-400 hover:text-white hover:bg-white/10"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Report
              </Button>
            </div>

            {/* Recommendation banner */}
            <Card className={`${recStyle.bg} ${recStyle.border} backdrop-blur-sm`}>
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">
                    Final Recommendation
                  </p>
                  <p className={`text-2xl font-bold leading-none mt-1 ${recStyle.text}`}>
                    {report.recommendation}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {report.recommendationReason}
                </p>
              </CardContent>
            </Card>

            {/* Scores */}
            <ReportSection icon={<Star className="w-4 h-4" />} title="Scores">
              <div className="grid grid-cols-2 gap-4">
                {(['desirability', 'feasibility', 'viability', 'novelty'] as const).map((key) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-400 capitalize">{key}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${scoreColor(report.scores[key].score)}`}>
                        {report.scores[key].score}/10
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-snug">
                      {report.scores[key].rationale}
                    </p>
                  </div>
                ))}
              </div>
            </ReportSection>

            <ReportSection icon={<Lightbulb className="w-4 h-4" />} title="Cleaned Idea">
              <div className="p-4 rounded-lg bg-slate-800/60 border border-white/10">
                <p className="text-white leading-relaxed">{report.cleanedIdea}</p>
              </div>
            </ReportSection>

            <ReportSection icon={<AlertTriangle className="w-4 h-4" />} title="Problem Statement">
              <p className="text-slate-200 text-sm leading-relaxed">{report.problemStatement}</p>
            </ReportSection>

            <ReportSection icon={<Users className="w-4 h-4" />} title="Target Customer">
              <p className="text-slate-200 text-sm leading-relaxed">{report.targetCustomer}</p>
            </ReportSection>

            <ReportSection icon={<Target className="w-4 h-4" />} title="Value Proposition">
              <p className="text-slate-200 text-sm leading-relaxed">{report.valueProposition}</p>
            </ReportSection>

            <ReportSection icon={<CheckSquare className="w-4 h-4" />} title="Key Assumptions">
              <ul className="space-y-2">
                {report.keyAssumptions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                    <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                    {a}
                  </li>
                ))}
              </ul>
            </ReportSection>

            <ReportSection icon={<AlertTriangle className="w-4 h-4" />} title="Main Risks">
              <div className="space-y-3">
                {report.mainRisks.map((r, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 mt-0.5 ${severityColor(r.severity)}`}>
                      {r.severity}
                    </span>
                    <p className="text-sm text-slate-200">{r.risk}</p>
                  </div>
                ))}
              </div>
            </ReportSection>

            <ReportSection icon={<Zap className="w-4 h-4" />} title="MVP Feature Suggestions">
              <ol className="space-y-2">
                {report.mvpFeatures.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                    <span className="text-amber-400 font-medium shrink-0">{i + 1}.</span>
                    {f}
                  </li>
                ))}
              </ol>
            </ReportSection>

            <ReportSection icon={<MessageSquare className="w-4 h-4" />} title="Validation Questions">
              <ol className="space-y-2">
                {report.validationQuestions.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                    <span className="text-amber-400 font-medium shrink-0 w-4">{i + 1}.</span>
                    {q}
                  </li>
                ))}
              </ol>
            </ReportSection>

            <ReportSection icon={<TrendingUp className="w-4 h-4" />} title="Synthetic Customer Objections">
              <div className="space-y-3">
                {report.customerObjections.map((obj, i) => (
                  <p key={i} className="text-sm text-slate-300 italic border-l-2 border-amber-500/30 pl-3">
                    "{obj}"
                  </p>
                ))}
              </div>
            </ReportSection>
          </div>
        )}

        {/* Empty state */}
        {!hasIdea && !isListening && !isLoading && !isOptimizing && !report && (
          <div className="text-center py-16">
            <div className="w-24 h-24 mx-auto rounded-2xl bg-white/5 flex items-center justify-center mb-6">
              {inputMode === 'speech' ? (
                <Mic className="w-12 h-12 text-slate-600" />
              ) : (
                <Type className="w-12 h-12 text-slate-600" />
              )}
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {inputMode === 'speech' ? 'Speak Your Business Idea' : 'Type Your Business Idea'}
            </h3>
            <p className="text-slate-400 max-w-md mx-auto">
              {inputMode === 'speech'
                ? 'Click the microphone, describe your idea, then optimize or validate it directly.'
                : 'Type your idea, choose a technique and report type, then generate your validation report.'}
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-slate-500">VentureLens AI · Business Idea Validation</p>
          <p className="text-xs text-slate-600">Powered by OpenRouter (Claude Sonnet)</p>
        </div>
      </footer>
    </div>
  )
}
