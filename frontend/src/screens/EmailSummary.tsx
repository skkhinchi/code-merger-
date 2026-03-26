import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import dayjs, { type Dayjs } from 'dayjs'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { apiBaseUrl } from '../config'
import { formatApiError } from '../utils/apiError'
import { withRetry } from '../utils/httpRetry'

export type SummaryItem = {
  sender: string
  subject?: string
  summary: string
  intent: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
}

/** Aligns with API `rawEmails` (same index as summaries). */
export type RawEmail = {
  sender: string
  subject: string
  body: string
}

type EmailSummaryResponse = {
  date: string
  count: number
  summaries: SummaryItem[]
  rawEmails?: unknown[]
  cached?: boolean
  /** MP3 payload for the spoken summary (same priority-grouped text as TTS). */
  audioBase64?: string | null
  audioMimeType?: string
  audioError?: string
}

type AgentApiResponse = {
  action: string
  message?: string
  summaries?: SummaryItem[]
  replyDraft?: string
  targetIndex?: number
  filterPriority?: string
  hasOriginalBodies?: boolean
}

const REQUEST_TIMEOUT_MS = 120_000
const MAX_BODY_SPEECH_CHARS = 1400
const MAX_SPEECH_SCRIPT_CHARS = 4096

function plainForSpeech(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function shortenForSpeechLine(text: string, max: number): string {
  const t = plainForSpeech(text)
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1))}…`
}

function indexInFullList(item: SummaryItem, full: SummaryItem[]): number {
  return full.findIndex(
    (x) =>
      x.sender === item.sender &&
      (x.subject ?? '') === (item.subject ?? '') &&
      x.summary === item.summary &&
      x.intent === item.intent &&
      x.priority === item.priority,
  )
}

/** Same script as backend `formatSummaryForSpeech` (priority sections + mail body). */
function buildClientSpeechScript(
  displayItems: SummaryItem[],
  fullItems: SummaryItem[],
  rawEmails: RawEmail[],
): string {
  type Row = { item: SummaryItem; rawIdx: number }
  const rows: Row[] = displayItems.map((item) => ({
    item,
    rawIdx: indexInFullList(item, fullItems),
  }))

  const groups: Record<'HIGH' | 'MEDIUM' | 'LOW', Row[]> = {
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  }
  for (const row of rows) {
    const p = row.item.priority ?? 'MEDIUM'
    const b = p === 'HIGH' || p === 'LOW' ? p : 'MEDIUM'
    groups[b].push(row)
  }

  const lines: string[] = []
  const section = (title: string, list: Row[]) => {
    if (list.length === 0) return
    lines.push(`${title} priority. ${list.length} ${list.length === 1 ? 'email' : 'emails'}.`)
    for (let n = 0; n < list.length; n++) {
      const { item, rawIdx } = list[n]
      const raw =
        rawIdx >= 0 && rawIdx < rawEmails.length
          ? rawEmails[rawIdx]
          : { sender: '', subject: '', body: '' }
      const subj = (item.subject ?? '').trim() || raw.subject || 'No subject'
      const sender = (item.sender ?? '').trim() || raw.sender || 'Unknown sender'
      const sum = (item.summary ?? '').trim()
      const intent = (item.intent ?? '').trim()
      lines.push(`Email ${n + 1}. Subject: ${subj}. From ${sender}.`)
      if (sum) lines.push(`Summary: ${sum}.`)
      if (intent) lines.push(`Intent: ${intent}.`)
      const bodySpeech = shortenForSpeechLine(raw.body ?? '', MAX_BODY_SPEECH_CHARS)
      if (bodySpeech) {
        lines.push(`Message: ${bodySpeech}`)
      } else {
        lines.push('Message: not available or empty.')
      }
      lines.push('')
    }
  }

  section('High', groups.HIGH)
  section('Medium', groups.MEDIUM)
  section('Low', groups.LOW)

  let text = lines.join('\n').trim()
  if (text.length > MAX_SPEECH_SCRIPT_CHARS) {
    text = `${text.slice(0, MAX_SPEECH_SCRIPT_CHARS - 1)}…`
  }
  return text
}

function normalizeRawEmails(raw: unknown): RawEmail[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r) => {
    if (!r || typeof r !== 'object') return { sender: '', subject: '', body: '' }
    const o = r as Record<string, unknown>
    return {
      sender: typeof o.sender === 'string' ? o.sender : '',
      subject: typeof o.subject === 'string' ? o.subject : '',
      body: typeof o.body === 'string' ? o.body : '',
    }
  })
}

function groupByPriority(items: SummaryItem[]) {
  const groups: Record<'HIGH' | 'MEDIUM' | 'LOW', SummaryItem[]> = {
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  }
  for (const item of items) {
    const p = item.priority ?? 'MEDIUM'
    if (p === 'HIGH' || p === 'LOW') {
      groups[p].push(item)
    } else {
      groups.MEDIUM.push(item)
    }
  }
  return groups
}

const SECTIONS: {
  key: 'HIGH' | 'MEDIUM' | 'LOW'
  label: string
  emoji: string
  accent: string
}[] = [
  { key: 'HIGH', label: 'HIGH Priority', emoji: '🔥', accent: '#f87171' },
  { key: 'MEDIUM', label: 'MEDIUM Priority', emoji: '⚡', accent: '#fbbf24' },
  { key: 'LOW', label: 'LOW Priority', emoji: '🟢', accent: '#4ade80' },
]

export default function EmailSummary() {
  const [date, setDate] = useState<Dayjs | null>(dayjs())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ date: string; count: number; cached?: boolean } | null>(null)
  const [items, setItems] = useState<SummaryItem[]>([])
  const [rawEmails, setRawEmails] = useState<RawEmail[]>([])

  const [agentCommand, setAgentCommand] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [agentMessage, setAgentMessage] = useState<string | null>(null)
  const [overrideItems, setOverrideItems] = useState<SummaryItem[] | null>(null)
  const [replyDraft, setReplyDraft] = useState<string | null>(null)
  const [replyMeta, setReplyMeta] = useState<{ targetIndex?: number } | null>(null)
  const [summaryAudioUrl, setSummaryAudioUrl] = useState<string | null>(null)
  const [ttsNote, setTtsNote] = useState<string | null>(null)
  const summaryAudioRef = useRef<HTMLAudioElement | null>(null)
  /** Revoke previous Blob URL from API MP3 (avoids leaks; data: URLs can break for large audio). */
  const summaryAudioObjectUrlRef = useRef<string | null>(null)

  const revokeSummaryAudioObjectUrl = () => {
    if (summaryAudioObjectUrlRef.current) {
      URL.revokeObjectURL(summaryAudioObjectUrlRef.current)
      summaryAudioObjectUrlRef.current = null
    }
  }

  const displayItems = overrideItems ?? items
  const grouped = useMemo(() => groupByPriority(displayItems), [displayItems])

  useEffect(() => () => revokeSummaryAudioObjectUrl(), [])

  /** Try to start playback when API returns MP3 (browser may block autoplay — user can use controls). */
  useEffect(() => {
    if (!summaryAudioUrl) return
    const id = requestAnimationFrame(() => {
      const el = summaryAudioRef.current
      if (!el) return
      el.load()
      void el.play().catch(() => {
        /* Autoplay policy */
      })
    })
    return () => cancelAnimationFrame(id)
  }, [summaryAudioUrl])

  const resetAgentUi = () => {
    setAgentCommand('')
    setAgentError(null)
    setAgentMessage(null)
    setOverrideItems(null)
    setReplyDraft(null)
    setReplyMeta(null)
  }

  const fetchSummary = async () => {
    const base = apiBaseUrl()
    if (!base) {
      setError('Missing VITE_API_URL in environment.')
      return
    }
    if (!date) {
      setError('Pick a date.')
      return
    }

    setLoading(true)
    setError(null)
    revokeSummaryAudioObjectUrl()
    setSummaryAudioUrl(null)
    setTtsNote(null)
    setRawEmails([])
    resetAgentUi()

    try {
      const res = await withRetry(
        () =>
          axios.post<EmailSummaryResponse>(
            `${base}/email-summary`,
            { date: date.toISOString() },
            {
              timeout: REQUEST_TIMEOUT_MS,
              maxContentLength: 50 * 1024 * 1024,
              maxBodyLength: 50 * 1024 * 1024,
            },
          ),
        { maxRetries: 3, baseDelayMs: 500 },
      )
      setMeta({
        date: res.data.date,
        count: res.data.count,
        cached: res.data.cached,
      })
      setItems(res.data.summaries ?? [])
      setRawEmails(normalizeRawEmails(res.data.rawEmails))
      const b64 = res.data.audioBase64
      const mime = res.data.audioMimeType ?? 'audio/mpeg'
      if (typeof b64 === 'string' && b64.length > 0) {
        try {
          revokeSummaryAudioObjectUrl()
          const binary = atob(b64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          const blob = new Blob([bytes], { type: mime })
          const url = URL.createObjectURL(blob)
          summaryAudioObjectUrlRef.current = url
          setSummaryAudioUrl(url)
        } catch (e) {
          console.error('[email-summary audio decode]', e)
          setSummaryAudioUrl(null)
          setTtsNote('Could not decode audio from the server. Use “Read summary aloud” below.')
        }
      } else {
        setSummaryAudioUrl(null)
      }
      if (res.data.audioError) {
        setTtsNote((prev) =>
          prev
            ? `${prev} Server: ${res.data.audioError}`
            : `Text-to-speech unavailable: ${res.data.audioError}`,
        )
      }
    } catch (e) {
      console.error('[email-summary]', e)
      setError(formatApiError(e))
    } finally {
      setLoading(false)
    }
  }

  const runAgentCommand = async () => {
    const base = apiBaseUrl()
    if (!base) {
      setAgentError('Missing VITE_API_URL.')
      return
    }
    const cmd = agentCommand.trim()
    if (!cmd) {
      setAgentError('Enter a command.')
      return
    }

    setAgentLoading(true)
    setAgentError(null)
    setAgentMessage(null)

    try {
      const res = await withRetry(
        () =>
          axios.post<AgentApiResponse>(
            `${base}/email-agent`,
            { command: cmd },
            { timeout: REQUEST_TIMEOUT_MS },
          ),
        { maxRetries: 3, baseDelayMs: 500 },
      )
      const data = res.data
      setAgentMessage(data.message ?? null)

      if (data.action === 'filter' && Array.isArray(data.summaries)) {
        setOverrideItems(data.summaries)
        setReplyDraft(null)
        setReplyMeta(null)
      } else if (data.action === 'reply_draft') {
        setReplyDraft(data.replyDraft ?? '')
        setReplyMeta({ targetIndex: data.targetIndex })
      } else {
        setOverrideItems(null)
        setReplyDraft(null)
        setReplyMeta(null)
      }
    } catch (e) {
      console.error('[email-agent]', e)
      setAgentError(formatApiError(e))
    } finally {
      setAgentLoading(false)
    }
  }

  const busy = loading || agentLoading

  const speakSummaryWithBrowser = () => {
    const script = buildClientSpeechScript(displayItems, items, rawEmails)
    if (!script || typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(script)
    u.rate = 1
    window.speechSynthesis.speak(u)
  }

  return (
    <Box
      sx={{
        flex: 1,
        py: 4,
        px: 2,
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        position: 'relative',
      }}
    >
      {busy && (
        <LinearProgress
          color={agentLoading && !loading ? 'secondary' : 'primary'}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
          }}
        />
      )}

      <Container maxWidth="md" sx={{ opacity: busy ? 0.85 : 1, transition: 'opacity 0.2s' }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700, mb: 1 }}>
          Email summary
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Fetch summaries for a day, then use follow-up commands (filter by priority, draft a
          reply). Context is kept on the server until you load a new day.
        </Typography>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 3,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <DatePicker
              label="Date"
              value={date}
              onChange={(v) => setDate(v)}
              disabled={busy}
              slotProps={{
                textField: {
                  fullWidth: true,
                  sx: { maxWidth: { sm: 280 } },
                },
              }}
            />
            <Button
              variant="contained"
              size="large"
              onClick={fetchSummary}
              disabled={busy}
              sx={{ minWidth: 200, py: 1.5 }}
            >
              {loading ? (
                <Stack direction="row" alignItems="center" gap={1}>
                  <CircularProgress size={22} color="inherit" />
                  <span>Loading…</span>
                </Stack>
              ) : (
                'Get Email Summary'
              )}
            </Button>
          </Stack>
        </Paper>

        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3 }}
            onClose={() => setError(null)}
            action={
              <Button color="inherit" size="small" onClick={fetchSummary}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {meta && meta.count > 0 && (
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              border: 1,
              borderColor: 'divider',
              borderLeft: 4,
              borderLeftColor: 'primary.main',
              bgcolor: 'background.paper',
            }}
          >
            <Stack direction="row" alignItems="flex-start" gap={1.5} sx={{ mb: ttsNote || !summaryAudioUrl ? 1.5 : 1 }}>
              <Typography component="span" sx={{ fontSize: '1.5rem', lineHeight: 1 }} aria-hidden>
                🔊
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  Listen to summary
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: summaryAudioUrl ? 1.5 : 1 }}>
                  Audio reads each priority group: subject, summary, and the message body (truncated if very
                  long). Use the browser read-aloud button if MP3 is unavailable.
                </Typography>
                {summaryAudioUrl && (
                  <audio
                    key={summaryAudioUrl}
                    ref={summaryAudioRef}
                    controls
                    autoPlay
                    playsInline
                    preload="auto"
                    style={{ width: '100%', maxWidth: 520 }}
                  >
                    <source src={summaryAudioUrl} type="audio/mpeg" />
                  </audio>
                )}
                {!summaryAudioUrl && !loading && (
                  <Typography variant="body2" color="warning.light" sx={{ mb: 1 }}>
                    No MP3 in this response (check backend logs and OPENAI_API_KEY). You can still use read-aloud.
                  </Typography>
                )}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }} alignItems="flex-start">
                  <Button variant="outlined" size="small" onClick={speakSummaryWithBrowser} disabled={items.length === 0}>
                    Read summary aloud (browser)
                  </Button>
                </Stack>
                {ttsNote && (
                  <Alert severity="warning" sx={{ mt: 2, py: 0.5 }} onClose={() => setTtsNote(null)}>
                    {ttsNote}
                  </Alert>
                )}
              </Box>
            </Stack>
          </Paper>
        )}

        {meta && items.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Follow-up agent
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              Examples: &quot;show only high priority emails&quot;, &quot;reply to this email&quot;
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              placeholder="e.g. show only high priority emails"
              value={agentCommand}
              onChange={(e) => setAgentCommand(e.target.value)}
              disabled={agentLoading}
              sx={{ mb: 2 }}
            />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                color="secondary"
                onClick={runAgentCommand}
                disabled={agentLoading || loading}
              >
                {agentLoading ? <CircularProgress size={22} color="inherit" /> : 'Run command'}
              </Button>
              {overrideItems && (
                <Button variant="outlined" onClick={() => setOverrideItems(null)} size="small">
                  Show all priorities
                </Button>
              )}
            </Stack>
          </Paper>
        )}

        {agentError && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setAgentError(null)}>
            {agentError}
          </Alert>
        )}

        {agentMessage && (
          <Alert severity="info" sx={{ mb: 2 }} onClose={() => setAgentMessage(null)}>
            {agentMessage}
          </Alert>
        )}

        {replyDraft !== null && replyDraft !== '' && (
          <Paper sx={{ p: 4, mb: 3, border: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Draft reply
              {replyMeta?.targetIndex !== undefined && (
                <Chip
                  label={`email #${replyMeta.targetIndex + 1}`}
                  size="small"
                  sx={{ ml: 1 }}
                />
              )}
            </Typography>
            <Typography
              component="pre"
              sx={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
                m: 0,
                p: 2,
                bgcolor: 'action.hover',
                borderRadius: 1,
              }}
            >
              {replyDraft}
            </Typography>
          </Paper>
        )}

        {meta && (
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }} flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">
              {new Date(meta.date).toLocaleString()} · {meta.count} message
              {meta.count === 1 ? '' : 's'}
            </Typography>
            {meta.cached && (
              <Chip label="Cached" size="small" color="secondary" variant="outlined" />
            )}
            {overrideItems && (
              <Chip label="Filtered view" size="small" color="warning" variant="outlined" />
            )}
          </Stack>
        )}

        {!loading && meta && meta.count === 0 && (
          <Alert severity="info">No messages for that day.</Alert>
        )}

        {SECTIONS.map(({ key, label, emoji, accent }) => {
          const list = grouped[key]
          if (list.length === 0) return null
          return (
            <Box key={key} sx={{ mb: 4 }}>
              <Typography
                variant="h6"
                sx={{
                  mb: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  color: accent,
                  fontWeight: 700,
                }}
              >
                <span aria-hidden>{emoji}</span> {label}
                <Chip label={list.length} size="small" sx={{ ml: 1 }} />
              </Typography>
              <Stack spacing={2}>
                {list.map((item, idx) => (
                  <Paper
                    key={`${key}-${idx}`}
                    elevation={0}
                    sx={{
                      p: 2.5,
                      border: 1,
                      borderColor: 'divider',
                      borderLeft: 4,
                      borderLeftColor: accent,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" display="block">
                      Sender
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 1.5, fontWeight: 500 }}>
                      {item.sender || '—'}
                    </Typography>
                    {item.subject ? (
                      <>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Subject
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1.5 }}>
                          {item.subject}
                        </Typography>
                      </>
                    ) : null}
                    <Typography variant="caption" color="text.secondary" display="block">
                      Summary
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1.5, lineHeight: 1.6 }}>
                      {item.summary || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Intent
                    </Typography>
                    <Typography variant="body2" color="secondary.light">
                      {item.intent || '—'}
                    </Typography>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )
        })}
      </Container>
    </Box>
  )
}
