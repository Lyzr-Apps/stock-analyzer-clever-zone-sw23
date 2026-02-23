'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import {
  listSchedules,
  getScheduleLogs,
  pauseSchedule,
  resumeSchedule,
  cronToHuman,
} from '@/lib/scheduler'
import type { Schedule, ExecutionLog } from '@/lib/scheduler'
import {
  HiArrowTrendingUp,
  HiArrowTrendingDown,
  HiMinus,
  HiPlay,
  HiPause,
  HiClock,
  HiSignal,
  HiChevronDown,
  HiChevronUp,
  HiArrowPath,
  HiCheckCircle,
  HiXCircle,
  HiInformationCircle,
  HiBolt,
  HiChartBar,
} from 'react-icons/hi2'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_ID = '699c608cb6c78525434dfd6c'
const SCHEDULE_ID = '699c6093399dfadeac38a2e8'

const THEME_VARS: React.CSSProperties & Record<string, string> = {
  '--background': '220 25% 7%',
  '--foreground': '220 15% 85%',
  '--card': '220 22% 10%',
  '--card-foreground': '220 15% 85%',
  '--primary': '220 80% 55%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '220 18% 16%',
  '--secondary-foreground': '220 15% 85%',
  '--accent': '160 70% 45%',
  '--accent-foreground': '0 0% 100%',
  '--destructive': '0 75% 55%',
  '--destructive-foreground': '0 0% 100%',
  '--muted': '220 15% 20%',
  '--muted-foreground': '220 12% 55%',
  '--border': '220 18% 18%',
  '--input': '220 15% 24%',
  '--ring': '220 80% 55%',
  '--radius': '0.125rem',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisEntry {
  id: string
  currentPrice: string
  priceChange: string
  direction: string
  bulletPoints: string[]
  timestamp: string
  source: 'manual' | 'scheduled'
}

interface SampleEntry {
  id: string
  currentPrice: string
  priceChange: string
  direction: string
  bulletPoints: string[]
  timestamp: string
  source: 'manual' | 'scheduled'
}

// ---------------------------------------------------------------------------
// Sample Data
// ---------------------------------------------------------------------------

function getSampleData(): SampleEntry[] {
  const now = Date.now()
  return [
    {
      id: 'sample-1',
      currentPrice: '$421.35',
      priceChange: '+$4.10 (+0.98%)',
      direction: 'up',
      bulletPoints: [
        'MSFT shares gained nearly 1% in early trading, building on momentum from strong cloud revenue guidance.',
        'Azure growth rate accelerated to 33% YoY, exceeding analyst expectations of 30%.',
        'Institutional buying pressure remains robust with above-average volume.'
      ],
      timestamp: new Date(now - 2 * 60 * 1000).toISOString(),
      source: 'manual',
    },
    {
      id: 'sample-2',
      currentPrice: '$417.25',
      priceChange: '-$2.15 (-0.51%)',
      direction: 'down',
      bulletPoints: [
        'MSFT dipped modestly amid broader tech sector rotation as investors moved toward defensive positions.',
        'Despite the pullback, the stock remains well above its 50-day moving average of $410.',
      ],
      timestamp: new Date(now - 12 * 60 * 1000).toISOString(),
      source: 'scheduled',
    },
    {
      id: 'sample-3',
      currentPrice: '$419.40',
      priceChange: '+$0.05 (+0.01%)',
      direction: 'flat',
      bulletPoints: [
        'MSFT traded essentially flat as the market awaits key CPI data tomorrow.',
        'Options activity suggests traders are positioning for a breakout above $425 resistance.',
        'AI infrastructure capex guidance remains a key focus for upcoming earnings call.'
      ],
      timestamp: new Date(now - 22 * 60 * 1000).toISOString(),
      source: 'scheduled',
    },
  ]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(isoString: string): string {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatTime(isoString: string): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

function formatDateTime(isoString: string): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
  }
}

function parseAgentResponse(data: unknown): Omit<AnalysisEntry, 'id' | 'source'> | null {
  if (!data) return null
  let parsed: Record<string, unknown> = {}

  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data)
    } catch {
      return null
    }
  } else if (typeof data === 'object') {
    parsed = data as Record<string, unknown>
  } else {
    return null
  }

  // Also check if there's a nested result
  if (parsed?.result && typeof parsed.result === 'object') {
    parsed = parsed.result as Record<string, unknown>
  }

  const currentPrice = typeof parsed?.current_price === 'string' ? parsed.current_price : 'N/A'
  const priceChange = typeof parsed?.price_change === 'string' ? parsed.price_change : 'N/A'
  const direction = typeof parsed?.direction === 'string' ? parsed.direction : 'flat'
  const bulletPoints = Array.isArray(parsed?.bullet_points) ? parsed.bullet_points.filter((b: unknown) => typeof b === 'string') as string[] : []
  const timestamp = typeof parsed?.timestamp === 'string' ? parsed.timestamp : new Date().toISOString()

  return { currentPrice, priceChange, direction, bulletPoints, timestamp }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f1219', color: '#ced3dc' }}>
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm mb-4" style={{ color: '#7f8694' }}>{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 rounded-sm text-sm font-medium"
              style={{ background: '#2b6cdb', color: '#ffffff' }}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Sub-components (not exported)
// ---------------------------------------------------------------------------

function DirectionIcon({ direction, size = 16 }: { direction: string; size?: number }) {
  if (direction === 'up') return <HiArrowTrendingUp size={size} style={{ color: '#22b87a' }} />
  if (direction === 'down') return <HiArrowTrendingDown size={size} style={{ color: '#d93a3a' }} />
  return <HiMinus size={size} style={{ color: '#7f8694' }} />
}

function DirectionChip({ direction }: { direction: string }) {
  const bg = direction === 'up' ? 'rgba(34,184,122,0.15)' : direction === 'down' ? 'rgba(217,58,58,0.15)' : 'rgba(127,134,148,0.12)'
  const color = direction === 'up' ? '#22b87a' : direction === 'down' ? '#d93a3a' : '#7f8694'
  const label = direction === 'up' ? 'Bullish' : direction === 'down' ? 'Bearish' : 'Neutral'

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium tracking-wide"
      style={{ background: bg, color }}
    >
      <DirectionIcon direction={direction} size={12} />
      {label}
    </span>
  )
}

function SkeletonCard() {
  return (
    <div
      className="p-4 rounded-sm border animate-pulse"
      style={{ background: '#141a24', borderColor: '#252d3a' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 rounded-sm w-24" style={{ background: '#2b303a' }} />
        <div className="h-5 rounded-sm w-16" style={{ background: '#2b303a' }} />
      </div>
      <div className="space-y-2">
        <div className="h-3 rounded-sm w-full" style={{ background: '#2b303a' }} />
        <div className="h-3 rounded-sm w-5/6" style={{ background: '#2b303a' }} />
        <div className="h-3 rounded-sm w-4/6" style={{ background: '#2b303a' }} />
      </div>
    </div>
  )
}

function AnalysisCard({ entry }: { entry: AnalysisEntry }) {
  return (
    <div
      className="p-4 rounded-sm border transition-colors duration-200"
      style={{ background: '#141a24', borderColor: '#252d3a' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HiClock size={13} style={{ color: '#7f8694' }} />
          <span className="text-xs font-medium" style={{ color: '#7f8694' }}>
            {relativeTime(entry.timestamp)}
          </span>
          <span className="text-xs" style={{ color: '#7f8694' }}>
            {formatTime(entry.timestamp)}
          </span>
          {entry.source === 'scheduled' && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-sm"
              style={{ background: 'rgba(43,108,219,0.12)', color: '#5a9aef' }}
            >
              Scheduled
            </span>
          )}
        </div>
        <DirectionChip direction={entry.direction} />
      </div>

      {/* Price info */}
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-lg font-semibold tracking-tight" style={{ color: '#ced3dc' }}>
          {entry.currentPrice}
        </span>
        <span
          className="text-sm font-medium"
          style={{
            color: entry.direction === 'up' ? '#22b87a' : entry.direction === 'down' ? '#d93a3a' : '#7f8694',
          }}
        >
          {entry.priceChange}
        </span>
      </div>

      {/* Bullet points */}
      {Array.isArray(entry.bulletPoints) && entry.bulletPoints.length > 0 && (
        <ul className="space-y-1.5">
          {entry.bulletPoints.map((point, i) => (
            <li key={i} className="flex gap-2 text-sm leading-tight" style={{ color: '#ced3dc' }}>
              <span className="mt-1.5 flex-shrink-0 w-1 h-1 rounded-full" style={{ background: '#2b6cdb' }} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none"
      style={{
        background: checked ? '#22b87a' : '#2b303a',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full transition-transform duration-200"
        style={{
          background: '#ffffff',
          transform: checked ? 'translateX(18px)' : 'translateX(3px)',
        }}
      />
    </button>
  )
}

function LogRow({ log }: { log: ExecutionLog }) {
  return (
    <div
      className="flex items-center justify-between py-2 px-3 rounded-sm text-xs"
      style={{ background: '#0f1219', borderBottom: '1px solid #252d3a' }}
    >
      <div className="flex items-center gap-2">
        {log.success ? (
          <HiCheckCircle size={14} style={{ color: '#22b87a' }} />
        ) : (
          <HiXCircle size={14} style={{ color: '#d93a3a' }} />
        )}
        <span style={{ color: '#ced3dc' }}>{formatDateTime(log.executed_at)}</span>
      </div>
      <span
        className="font-medium"
        style={{ color: log.success ? '#22b87a' : '#d93a3a' }}
      >
        {log.success ? 'Success' : 'Failed'}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Page() {
  // State
  const [feed, setFeed] = useState<AnalysisEntry[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [showSampleData, setShowSampleData] = useState(false)
  const [scheduleActive, setScheduleActive] = useState<boolean | null>(null)
  const [scheduleData, setScheduleData] = useState<Schedule | null>(null)
  const [toggling, setToggling] = useState(false)
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [showSchedulePanel, setShowSchedulePanel] = useState(false)
  const [newUpdateBanner, setNewUpdateBanner] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const feedContainerRef = useRef<HTMLDivElement>(null)
  const lastLogIdRef = useRef<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Current display data
  const displayFeed = showSampleData && feed.length === 0 ? getSampleData() : feed

  // Fetch schedule status on mount
  const loadScheduleStatus = useCallback(async () => {
    try {
      const result = await listSchedules({ agentId: AGENT_ID })
      if (result.success && Array.isArray(result.schedules)) {
        const sched = result.schedules.find((s) => s.id === SCHEDULE_ID) || result.schedules[0]
        if (sched) {
          setScheduleData(sched)
          setScheduleActive(sched.is_active)
        }
      }
    } catch {
      // Silent fail on schedule load
    }
  }, [])

  // Fetch schedule logs
  const loadLogs = useCallback(async () => {
    try {
      const result = await getScheduleLogs(SCHEDULE_ID, { limit: 5 })
      if (result.success && Array.isArray(result.executions)) {
        setLogs(result.executions)
        setLogsTotal(result.total)
      }
    } catch {
      // Silent fail
    }
  }, [])

  // Poll for new scheduled results
  const pollForNewResults = useCallback(async () => {
    try {
      const result = await getScheduleLogs(SCHEDULE_ID, { limit: 3 })
      if (!result.success || !Array.isArray(result.executions)) return

      const executions = result.executions
      if (executions.length === 0) return

      const latestLog = executions[0]
      if (!latestLog || !latestLog.id) return

      // If we have seen this log already, skip
      if (lastLogIdRef.current === latestLog.id) return

      // First poll - just record the ID
      if (lastLogIdRef.current === null) {
        lastLogIdRef.current = latestLog.id
        return
      }

      lastLogIdRef.current = latestLog.id

      // Parse the response_output
      if (latestLog.success && latestLog.response_output) {
        const parsed = parseAgentResponse(latestLog.response_output)
        if (parsed) {
          const entry: AnalysisEntry = {
            id: generateId(),
            ...parsed,
            source: 'scheduled',
          }

          setFeed((prev) => {
            // Avoid duplicates by checking timestamps
            const isDuplicate = prev.some((e) => e.timestamp === entry.timestamp && e.currentPrice === entry.currentPrice)
            if (isDuplicate) return prev
            return [entry, ...prev]
          })
          setLastUpdated(new Date().toISOString())

          // Check if user is scrolled down
          if (feedContainerRef.current) {
            const el = feedContainerRef.current
            if (el.scrollTop > 100) {
              setNewUpdateBanner(true)
            }
          }
        }
      }

      // Also refresh logs
      setLogs(executions)
      setLogsTotal(result.total)
    } catch {
      // Silent fail on polling
    }
  }, [])

  // Run analysis manually
  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      const result = await callAIAgent('Analyze the current MSFT stock price, direction, and key trends. Return current_price, price_change, direction, bullet_points, and timestamp.', AGENT_ID)

      if (result.success) {
        const data = result?.response?.result
        const parsed = parseAgentResponse(data)
        if (parsed) {
          const entry: AnalysisEntry = {
            id: generateId(),
            ...parsed,
            source: 'manual',
          }
          setFeed((prev) => [entry, ...prev])
          setLastUpdated(new Date().toISOString())
        } else {
          setAnalysisError('Received unexpected response format from agent.')
        }
      } else {
        setAnalysisError(result?.error || 'Analysis failed. Please try again.')
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Network error during analysis.')
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  // Toggle scheduler
  const handleToggleSchedule = useCallback(async () => {
    if (!scheduleData) return
    setToggling(true)

    try {
      if (scheduleData.is_active) {
        await pauseSchedule(scheduleData.id)
      } else {
        await resumeSchedule(scheduleData.id)
      }
      // Always refresh schedule list after toggle
      await loadScheduleStatus()
    } catch {
      // Silent fail
    } finally {
      setToggling(false)
    }
  }, [scheduleData, loadScheduleStatus])

  // Scroll to top when new update banner clicked
  const scrollToTop = useCallback(() => {
    if (feedContainerRef.current) {
      feedContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
    setNewUpdateBanner(false)
  }, [])

  // Effects
  useEffect(() => {
    setMounted(true)
    loadScheduleStatus()
    loadLogs()

    // Poll every 60s
    pollIntervalRef.current = setInterval(pollForNewResults, 60000)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [loadScheduleStatus, loadLogs, pollForNewResults])

  // Relative time ticker (re-render timestamps)
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30000)
    return () => clearInterval(t)
  }, [])

  // Derived values
  const latestEntry = displayFeed.length > 0 ? displayFeed[0] : null
  const cronText = scheduleData?.cron_expression ? cronToHuman(scheduleData.cron_expression) : 'Every 10 minutes'

  if (!mounted) return null

  return (
    <ErrorBoundary>
      <div style={THEME_VARS as React.CSSProperties} className="min-h-screen font-sans" >
        <div className="min-h-screen flex flex-col" style={{ background: '#0f1219', color: '#ced3dc' }}>

          {/* ====================== HEADER ====================== */}
          <header
            className="sticky top-0 z-30 border-b px-4 py-3"
            style={{ background: '#141a24', borderColor: '#252d3a' }}
          >
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              {/* Left: Title + ticker */}
              <div className="flex items-center gap-3">
                <HiChartBar size={22} style={{ color: '#2b6cdb' }} />
                <h1 className="text-lg font-semibold tracking-tight" style={{ color: '#ced3dc' }}>
                  MSFT Stock Monitor
                </h1>

                {/* Live ticker badge */}
                {latestEntry && (
                  <div
                    className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium"
                    style={{
                      background: latestEntry.direction === 'up' ? 'rgba(34,184,122,0.12)' : latestEntry.direction === 'down' ? 'rgba(217,58,58,0.12)' : 'rgba(127,134,148,0.1)',
                      color: latestEntry.direction === 'up' ? '#22b87a' : latestEntry.direction === 'down' ? '#d93a3a' : '#7f8694',
                    }}
                  >
                    <DirectionIcon direction={latestEntry.direction} size={14} />
                    <span>{latestEntry.currentPrice}</span>
                    <span>{latestEntry.priceChange}</span>
                  </div>
                )}
              </div>

              {/* Right: Status + sample toggle */}
              <div className="flex items-center gap-3">
                {/* Schedule status pill */}
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium"
                  style={{
                    background: scheduleActive ? 'rgba(34,184,122,0.12)' : 'rgba(217,58,58,0.12)',
                    color: scheduleActive ? '#22b87a' : '#d93a3a',
                  }}
                >
                  <HiSignal size={12} />
                  {scheduleActive === null ? 'Loading...' : scheduleActive ? 'Active' : 'Paused'}
                </div>

                {/* Last updated */}
                {lastUpdated && (
                  <span className="hidden md:block text-xs" style={{ color: '#7f8694' }}>
                    Updated {relativeTime(lastUpdated)}
                  </span>
                )}

                {/* Sample data toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#7f8694' }}>Sample Data</span>
                  <ToggleSwitch
                    checked={showSampleData}
                    onChange={() => setShowSampleData((v) => !v)}
                  />
                </div>
              </div>
            </div>
          </header>

          {/* ====================== CONTROL BAR ====================== */}
          <div
            className="border-b px-4 py-3"
            style={{ background: '#0f1219', borderColor: '#252d3a' }}
          >
            <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              {/* Run Analysis button */}
              <button
                onClick={runAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-colors duration-200 focus:outline-none"
                style={{
                  background: isAnalyzing ? '#222a36' : '#2b6cdb',
                  color: isAnalyzing ? '#7f8694' : '#ffffff',
                  cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                }}
              >
                {isAnalyzing ? (
                  <>
                    <HiArrowPath size={16} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <HiBolt size={16} />
                    Run Analysis Now
                  </>
                )}
              </button>

              {/* Scheduler toggle */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <ToggleSwitch
                    checked={scheduleActive === true}
                    onChange={handleToggleSchedule}
                    disabled={toggling || scheduleActive === null}
                  />
                  <span className="text-sm" style={{ color: '#ced3dc' }}>
                    Scheduler
                  </span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-sm" style={{ background: '#222a36', color: '#7f8694' }}>
                  {cronText}
                </span>
                {toggling && <HiArrowPath size={14} className="animate-spin" style={{ color: '#7f8694' }} />}
              </div>
            </div>
          </div>

          {/* ====================== ERROR BANNER ====================== */}
          {analysisError && (
            <div
              className="px-4 py-2 text-sm border-b"
              style={{ background: 'rgba(217,58,58,0.1)', color: '#d93a3a', borderColor: '#252d3a' }}
            >
              <div className="max-w-5xl mx-auto flex items-center gap-2">
                <HiXCircle size={16} />
                <span>{analysisError}</span>
                <button
                  onClick={() => setAnalysisError(null)}
                  className="ml-auto text-xs underline"
                  style={{ color: '#d93a3a' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* ====================== NEW UPDATE BANNER ====================== */}
          {newUpdateBanner && (
            <div
              className="px-4 py-2 text-sm border-b cursor-pointer"
              style={{ background: 'rgba(43,108,219,0.12)', color: '#5a9aef', borderColor: '#252d3a' }}
              onClick={scrollToTop}
            >
              <div className="max-w-5xl mx-auto flex items-center gap-2 justify-center">
                <HiArrowTrendingUp size={14} />
                <span className="font-medium">New update available</span>
                <span className="text-xs">-- click to scroll to top</span>
              </div>
            </div>
          )}

          {/* ====================== MAIN CONTENT ====================== */}
          <main className="flex-1 overflow-hidden flex flex-col">
            <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col px-4 py-4 gap-4 overflow-hidden">

              {/* Feed area */}
              <div
                ref={feedContainerRef}
                className="flex-1 overflow-y-auto space-y-3 pr-1"
                style={{ minHeight: 0 }}
              >
                {/* Loading skeleton */}
                {isAnalyzing && <SkeletonCard />}

                {/* Feed entries */}
                {displayFeed.length > 0 ? (
                  displayFeed.map((entry) => (
                    <AnalysisCard key={entry.id} entry={entry} />
                  ))
                ) : (
                  !isAnalyzing && (
                    <div
                      className="flex flex-col items-center justify-center py-16 px-6 rounded-sm border text-center"
                      style={{ background: '#141a24', borderColor: '#252d3a' }}
                    >
                      <HiChartBar size={40} style={{ color: '#2b303a' }} />
                      <h3 className="mt-4 text-sm font-medium" style={{ color: '#ced3dc' }}>
                        No analysis data yet
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed max-w-sm" style={{ color: '#7f8694' }}>
                        Analysis will appear here once the scheduler runs its first cycle. Click Run Analysis Now to get started.
                      </p>
                      <button
                        onClick={runAnalysis}
                        disabled={isAnalyzing}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium"
                        style={{ background: '#2b6cdb', color: '#ffffff' }}
                      >
                        <HiBolt size={14} />
                        Run Analysis Now
                      </button>
                    </div>
                  )
                )}
              </div>

              {/* ====================== SCHEDULE MANAGEMENT PANEL ====================== */}
              <div
                className="rounded-sm border"
                style={{ background: '#141a24', borderColor: '#252d3a' }}
              >
                {/* Panel header (collapsible toggle) */}
                <button
                  onClick={() => setShowSchedulePanel((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium focus:outline-none"
                  style={{ color: '#ced3dc' }}
                >
                  <div className="flex items-center gap-2">
                    <HiClock size={16} style={{ color: '#2b6cdb' }} />
                    <span>Schedule Management</span>
                  </div>
                  {showSchedulePanel ? <HiChevronUp size={16} /> : <HiChevronDown size={16} />}
                </button>

                {showSchedulePanel && (
                  <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid #252d3a' }}>
                    {/* Schedule info row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                      <div>
                        <div className="text-xs mb-1" style={{ color: '#7f8694' }}>Status</div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: scheduleActive ? '#22b87a' : '#d93a3a' }}
                          />
                          <span className="text-sm font-medium" style={{ color: '#ced3dc' }}>
                            {scheduleActive === null ? 'Loading' : scheduleActive ? 'Active' : 'Paused'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs mb-1" style={{ color: '#7f8694' }}>Frequency</div>
                        <span className="text-sm font-medium" style={{ color: '#ced3dc' }}>{cronText}</span>
                      </div>
                      <div>
                        <div className="text-xs mb-1" style={{ color: '#7f8694' }}>Timezone</div>
                        <span className="text-sm font-medium" style={{ color: '#ced3dc' }}>
                          {scheduleData?.timezone || 'America/New_York'}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs mb-1" style={{ color: '#7f8694' }}>Next Run</div>
                        <span className="text-sm font-medium" style={{ color: '#ced3dc' }}>
                          {scheduleData?.next_run_time ? formatDateTime(scheduleData.next_run_time) : (scheduleActive ? 'Pending' : 'N/A')}
                        </span>
                      </div>
                    </div>

                    {/* Toggle button */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleToggleSchedule}
                        disabled={toggling || scheduleActive === null}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors"
                        style={{
                          background: scheduleActive ? 'rgba(217,58,58,0.15)' : 'rgba(34,184,122,0.15)',
                          color: scheduleActive ? '#d93a3a' : '#22b87a',
                          cursor: toggling ? 'not-allowed' : 'pointer',
                          opacity: toggling ? 0.5 : 1,
                        }}
                      >
                        {toggling ? (
                          <HiArrowPath size={12} className="animate-spin" />
                        ) : scheduleActive ? (
                          <HiPause size={12} />
                        ) : (
                          <HiPlay size={12} />
                        )}
                        {scheduleActive ? 'Pause Schedule' : 'Resume Schedule'}
                      </button>

                      <button
                        onClick={() => { loadLogs(); loadScheduleStatus() }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium"
                        style={{ background: '#222a36', color: '#7f8694' }}
                      >
                        <HiArrowPath size={12} />
                        Refresh
                      </button>
                    </div>

                    {/* Recent execution history */}
                    <div>
                      <div className="text-xs font-medium mb-2" style={{ color: '#7f8694' }}>
                        Recent Executions ({logsTotal} total)
                      </div>
                      {Array.isArray(logs) && logs.length > 0 ? (
                        <div className="space-y-1">
                          {logs.map((log) => (
                            <LogRow key={log.id} log={log} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs py-3 text-center" style={{ color: '#7f8694' }}>
                          No execution history yet
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ====================== AGENT INFO ====================== */}
              <div
                className="rounded-sm border px-4 py-3"
                style={{ background: '#141a24', borderColor: '#252d3a' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HiInformationCircle size={14} style={{ color: '#7f8694' }} />
                    <span className="text-xs" style={{ color: '#7f8694' }}>
                      Powered by
                    </span>
                    <span className="text-xs font-medium" style={{ color: '#ced3dc' }}>
                      MSFT Stock Analysis Agent
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: isAnalyzing ? '#2b6cdb' : '#22b87a' }}
                    />
                    <span className="text-xs" style={{ color: '#7f8694' }}>
                      {isAnalyzing ? 'Processing' : 'Ready'}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}
