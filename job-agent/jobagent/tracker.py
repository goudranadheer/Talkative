"""Application tracking helpers on top of the jobs table."""
from datetime import datetime, timedelta, timezone

from . import db

FOLLOW_UP_AFTER_DAYS = 7


def set_status(job_id: str, status: str, note: str = "") -> None:
    job = db.get_job(job_id)
    if job is None:
        raise ValueError(f"No job found with id '{job_id}'")
    db.update_status(job_id, status, note)


def summary() -> dict:
    return db.stats()


def needs_follow_up() -> list:
    """Applications marked 'applied' more than FOLLOW_UP_AFTER_DAYS ago with no
    later status change."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=FOLLOW_UP_AFTER_DAYS)
    stale = []
    for job in db.list_jobs(status="applied"):
        applied_at = job["applied_at"]
        if not applied_at:
            continue
        try:
            applied_dt = datetime.fromisoformat(applied_at)
        except ValueError:
            continue
        if applied_dt <= cutoff:
            stale.append(job)
    return stale
