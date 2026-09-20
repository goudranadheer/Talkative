"""SQLite-backed storage for job candidates and application tracking."""
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterator, Optional

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT,
    location TEXT,
    url TEXT,
    description TEXT,
    salary TEXT,
    posted_at TEXT,
    fetched_at TEXT,
    match_score REAL,
    match_reasoning TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    tailored_resume_path TEXT,
    tailored_cover_letter_path TEXT,
    applied_at TEXT,
    notes TEXT
);
"""

VALID_STATUSES = [
    "new",
    "matched",
    "ignored",
    "tailored",
    "applied",
    "interviewing",
    "offer",
    "rejected",
    "declined",
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    config.ensure_dirs()
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


@dataclass
class Job:
    id: str
    source: str
    title: str
    company: str = ""
    location: str = ""
    url: str = ""
    description: str = ""
    salary: str = ""
    posted_at: str = ""
    fetched_at: str = field(default_factory=_now)
    match_score: Optional[float] = None
    match_reasoning: str = ""
    status: str = "new"
    tailored_resume_path: str = ""
    tailored_cover_letter_path: str = ""
    applied_at: str = ""
    notes: str = ""


def upsert_job(job: Job) -> bool:
    """Insert a job if new. Returns True if it was newly inserted."""
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM jobs WHERE id = ?", (job.id,)).fetchone()
        if existing:
            return False
        conn.execute(
            """
            INSERT INTO jobs (id, source, title, company, location, url, description,
                               salary, posted_at, fetched_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job.id, job.source, job.title, job.company, job.location, job.url,
                job.description, job.salary, job.posted_at, job.fetched_at, job.status,
            ),
        )
        return True


def get_job(job_id: str) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()


def list_jobs(status: Optional[str] = None, order_by: str = "match_score DESC, fetched_at DESC"):
    with get_conn() as conn:
        if status:
            return conn.execute(
                f"SELECT * FROM jobs WHERE status = ? ORDER BY {order_by}", (status,)
            ).fetchall()
        return conn.execute(f"SELECT * FROM jobs ORDER BY {order_by}").fetchall()


def update_match(job_id: str, score: float, reasoning: str, status: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE jobs SET match_score = ?, match_reasoning = ?, status = ? WHERE id = ?",
            (score, reasoning, status, job_id),
        )


def update_tailored_paths(job_id: str, resume_path: str, cover_letter_path: str) -> None:
    with get_conn() as conn:
        conn.execute(
            """UPDATE jobs SET tailored_resume_path = ?, tailored_cover_letter_path = ?,
               status = 'tailored' WHERE id = ?""",
            (resume_path, cover_letter_path, job_id),
        )


def update_status(job_id: str, status: str, note: str = "") -> None:
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid status '{status}'. Must be one of {VALID_STATUSES}")
    with get_conn() as conn:
        row = conn.execute("SELECT notes FROM jobs WHERE id = ?", (job_id,)).fetchone()
        existing_notes = (row["notes"] or "") if row else ""
        appended_notes = existing_notes
        if note:
            entry = f"[{_now()}] {note}"
            appended_notes = f"{existing_notes}\n{entry}" if existing_notes else entry
        if status == "applied":
            conn.execute(
                "UPDATE jobs SET status = ?, applied_at = ?, notes = ? WHERE id = ?",
                (status, _now(), appended_notes, job_id),
            )
        else:
            conn.execute(
                "UPDATE jobs SET status = ?, notes = ? WHERE id = ?",
                (status, appended_notes, job_id),
            )


def stats() -> dict:
    with get_conn() as conn:
        rows = conn.execute("SELECT status, COUNT(*) as n FROM jobs GROUP BY status").fetchall()
        return {row["status"]: row["n"] for row in rows}
