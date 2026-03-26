# Code Merger + Email Intelligence

AI-powered internal operations app that combines:

- **DevOps merge assistant** (natural language -> PR -> merge confirmation)
- **Gmail daily summarizer** (priority classification + follow-up agent)
- **Text-to-speech output** for hands-free listening of summary + message content

---

## What Problem This Solves

Engineering and operations teams repeatedly lose time on:

- Manual branch promotion steps (`dev -> tnqa -> preprod`)
- Context switching between GitHub, Slack, and deployment boards
- Reading large email volumes to identify high-priority actions

This app reduces that overhead by adding AI-assisted automation and a clean UI for both workflows.

---

## Real-World Use Cases

### 1) Environment Promotion Workflow
When teams follow staged rollout pipelines:

- `dev` -> `tnqa` for QA verification
- `tnqa` -> `preprod` for final validation

the app allows an operator to type:

- `merge dev to tnqa`
- `merge tnqa to preprod`

and execute with a confirmation gate.

### 2) Daily Email Triage
For founders, managers, and support/ops:

- Pull all emails for a selected date
- Auto-classify as `HIGH | MEDIUM | LOW`
- Ask follow-up commands like:
  - `show only high priority emails`
  - `reply to this email`
- Listen to spoken summary with message content (useful while commuting / multitasking)

---

## High-Level Architecture

### Frontend (`/frontend`)

- React + TypeScript + Vite + MUI
- Pages:
  - `/` -> DevOps merge assistant
  - `/emails` -> Email summarizer + audio playback
- Talks to backend using `VITE_API_URL` (or `/api` proxy in dev)

### Backend (`/backend`)

- Node.js + Express
- Integrations:
  - OpenAI (command parsing, summarization, follow-up reasoning, TTS)
  - GitHub REST API (create PR, merge PR)
  - Gmail API OAuth2 (fetch and parse emails)
- In-memory summary cache for faster repeat loads

---

## End-to-End Flow

### A) Merge Agent Flow

1. User enters command (example: `merge dev to tnqa`)
2. Backend `/command` uses OpenAI to parse action/source/target
3. Backend creates GitHub PR (`head=source`, `base=target`)
4. UI asks for confirmation
5. Backend `/confirm` merges the PR

### B) Email Summarizer Flow

1. User picks a date and clicks **Get Email Summary**
2. Backend fetches Gmail messages for that date
3. OpenAI summarizes each email with:
   - summary
   - intent
   - priority (`HIGH|MEDIUM|LOW`)
4. Backend returns:
   - structured summaries
   - raw parsed email content
   - optional MP3 audio (`audioBase64`)
5. Frontend renders grouped cards and audio player
6. Follow-up `/email-agent` supports filtering and reply drafting on the same context

---

## Project Structure

```text
code-merger/
├── backend/
│   ├── index.js                  # API server + routes
│   ├── github.js                 # GitHub PR + merge integration
│   ├── agent.js                  # Merge command parser
│   ├── gmailService.js           # Gmail OAuth + fetch
│   ├── aiEmailService.js         # Email summarization model calls
│   ├── emailAgentService.js      # Follow-up commands (filter/reply/chat)
│   ├── speechService.js          # TTS script + MP3 generation
│   └── .env                      # Local secrets (ignored by git)
└── frontend/
    ├── src/Home.tsx              # DevOps merge UI
    ├── src/screens/EmailSummary.tsx
    └── .env                      # Local frontend env (ignored by git)
```

---

## API Routes

### Health
- `GET /health`

### Git / Merge
- `POST /command` -> parse natural language and create PR
- `POST /confirm` -> merge pending PR

### Gmail / Summary
- `GET /auth/google` -> start OAuth
- `GET /auth/google/callback` -> OAuth callback
- `GET /api/gmail/emails?date=YYYY-MM-DD` -> raw email fetch helper
- `POST /email-summary` -> AI summary + optional audio payload
- `POST /email-agent` -> follow-up command on loaded summary context

---

## Environment Variables

### Backend `.env`

Required:

- `OPENAI_API_KEY`
- `GITHUB_TOKEN`
- `OWNER` (GitHub org/user)
- `REPO` (GitHub repo name)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (must match Google Console OAuth redirect)

Optional:

- `PORT` (default `5001`)
- `EMAIL_FETCH_MAX` (default `20`)

### Frontend `.env`

- `VITE_API_URL=http://localhost:5001`

---

## Local Setup

## 1) Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 2) Configure environment files

- Add backend secrets in `backend/.env`
- Add frontend API URL in `frontend/.env`

## 3) Start backend

```bash
cd backend
npm start
```

Expected:

- `Server running on port 5001 (http://localhost:5001)`

## 4) Start frontend

```bash
cd frontend
npm run dev
```

Open the displayed local URL (usually `http://localhost:5173`).

## 5) Connect Gmail once

Visit:

- `http://localhost:5001/auth/google`

Complete OAuth consent and return to app.

---

## How To Use

### DevOps Merge Assistant

1. Open `/`
2. Enter command:
   - `merge dev to tnqa`
   - `merge tnqa to preprod`
3. Click **Run Command**
4. Confirm merge in modal

### Email Summary + Audio

1. Open `/emails`
2. Choose date and click **Get Email Summary**
3. Review grouped priority cards
4. Play generated MP3 in **Listen to summary**
5. Use follow-up commands:
   - `show only high priority emails`
   - `reply to this email`

---

## Security Notes

- Never commit `.env` files or OAuth token files.
- Rotate keys immediately if leaked.
- Keep GitHub token scoped to minimum required permissions.
- Use separate credentials for development and production.

---

## Current Limitations

- In-memory cache/context (single-instance dev behavior)
- Pending merge state is in memory (not persisted across restart)
- Audio is returned as base64 in JSON (large payload for long summaries)

---

## Recommended Next Improvements

- Persist cache/context in Redis
- Add role-based auth for merge endpoints
- Add audit log for merge requests and approvals
- Move long audio to object storage and return signed URL
- Add CI checks + secret scanning (gitleaks/trufflehog)

---

## License

This repository currently has no explicit license file. Add one before public distribution.

