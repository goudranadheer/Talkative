# jobagent

A personal job-application CLI agent. It searches public job boards, scores
listings against your resume with an LLM, generates a tailored resume +
cover letter per job, tracks your application pipeline, and can open a real
browser to autofill an application form for you to review and submit.

**It never submits an application on its own.** The `apply` command fills in
what it can recognize (name, email, phone, resume/cover-letter upload, etc.)
and then hands control back to you in the browser window so you can check
everything and click submit yourself. This keeps you in control of what
actually gets sent, and avoids running afoul of a job site's bot/automation
policies.

## Setup

```bash
cd job-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium   # only needed for `jobagent apply`

cp .env.example .env
# edit .env: set LLM_PROVIDER (openai or anthropic) and the matching API key
```

Install the CLI entry point (optional but convenient):

```bash
pip install -e .
```

Without installing, you can always run commands as `python -m jobagent <command>`.

## Usage

```bash
jobagent init          # interactive: name, resume path, target roles, keywords, etc.
jobagent search        # pull jobs from Remotive / RemoteOK / Adzuna into local DB
jobagent match         # LLM-score fetched jobs against your resume/preferences
jobagent list --status matched
jobagent show <job_id>
jobagent tailor <job_id>   # generate tailored resume.md/.docx + cover_letter.md/.docx
jobagent apply <job_id>    # opens the job in a browser, autofills, you review & submit
jobagent status <job_id> interviewing --note "Phone screen scheduled for Fri"
jobagent stats          # pipeline counts + which applications may need a follow-up
```

All data lives in `data/` (gitignored): `data/profile.yaml`, `data/jobagent.db`
(SQLite), and `data/applications/<job>/` for generated resumes/cover letters.

## Job sources

- **Remotive** and **RemoteOK** — public APIs, no key required, remote-focused.
- **Adzuna** — optional, broader (non-remote-only) listings; requires a free
  `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` from https://developer.adzuna.com/, set
  in `.env`. Skipped automatically if not configured.

## Status pipeline

`new -> matched/ignored -> tailored -> applied -> interviewing -> offer/rejected/declined`

You can jump straight to any status with `jobagent status <job_id> <status>`.

## Design notes / limitations

- **Resume tailoring is truthful-by-construction**: the prompts explicitly
  instruct the LLM to reorganize and rephrase real content, never invent
  employers, titles, or skills. Always proofread the output before sending.
- **Autofill is heuristic**: it matches form fields by label/placeholder/name
  text (first name, email, phone, resume upload, etc.). Unfamiliar or
  site-specific fields (work authorization, EEO questions, custom essays)
  are left blank for you to fill in — this is intentional, since those need
  a human's judgment.
- **No blind auto-submit, ever.** This is a deliberate design choice, not a
  missing feature.
- Job descriptions are truncated to ~4000 characters before being sent to the
  LLM to control cost/latency; very long postings may lose some detail.
