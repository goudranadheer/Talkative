"""Launches a real, visible browser window and fills in what it can.

Design intent: this NEVER clicks apply/submit. It opens the job posting,
fills recognizable fields with your profile info and tailored resume/cover
letter, then hands control back to you in the browser to review every field
and submit yourself. That keeps you in control of what actually gets sent,
and avoids running afoul of a job site's automation/bot policies.

Two entry points share the same fill logic:
- `autofill_application` (CLI): blocks on an `input()` prompt, then closes
  the browser itself.
- `autofill_application_async` (web UI): returns the fill summary as soon as
  filling is done (so the HTTP request doesn't hang), while a background
  thread keeps the browser alive until you close the window yourself.
"""
import queue
import threading
from pathlib import Path
from typing import Optional

from .. import db
from ..profile import Profile
from .generic import FillContext, fill_form


def _load_playwright():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "playwright is not installed. Run `pip install playwright && "
            "playwright install chromium`."
        ) from exc
    return sync_playwright


def _build_context(job, profile: Profile) -> FillContext:
    resume_file = _pick_file(job["tailored_resume_path"], profile.resume_path)
    cover_letter_file = _pick_file(job["tailored_cover_letter_path"])
    cover_letter_text = _read_text(job["tailored_cover_letter_path"])

    name_parts = (profile.name or "").split(" ", 1)
    return FillContext(
        name=profile.name,
        first_name=name_parts[0] if name_parts else "",
        last_name=name_parts[1] if len(name_parts) > 1 else "",
        email=profile.email,
        phone=profile.phone,
        linkedin=profile.linkedin,
        website=profile.website,
        location=profile.location,
        resume_file=resume_file,
        cover_letter_file=cover_letter_file,
        cover_letter_text=cover_letter_text,
    )


def _get_job_and_url(job_id: str):
    job = db.get_job(job_id)
    if job is None:
        raise ValueError(f"No job found with id '{job_id}'")
    if not job["url"]:
        raise ValueError("This job has no URL to open.")
    return job


def autofill_application(job_id: str, profile: Profile) -> dict:
    job = _get_job_and_url(job_id)
    sync_playwright = _load_playwright()
    ctx = _build_context(job, profile)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(job["url"], wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)

        result = fill_form(page, ctx)

        print(f"\nOpened: {job['url']}")
        print(f"Filled {len(result['filled'])} field(s):")
        for line in result["filled"]:
            print(f"  + {line}")
        if result["skipped"]:
            print(f"Left {len(result['skipped'])} field(s) for you to fill:")
            for line in result["skipped"]:
                print(f"  - {line}")
        print(
            "\nReview every field in the browser window, then submit the "
            "application yourself. This tool will never click submit for you."
        )
        input("Press Enter here once you're done (this will close the browser)... ")

        browser.close()

    return result


def autofill_application_async(job_id: str, profile: Profile, fill_timeout: float = 45.0) -> dict:
    """Same behavior as `autofill_application`, but for a caller (the web
    server) that can't block on a terminal `input()`. Returns the fill
    summary as soon as fields are filled; the browser window stays open
    (managed by a background thread) until the person closes it themselves.
    """
    job = _get_job_and_url(job_id)
    sync_playwright = _load_playwright()
    ctx = _build_context(job, profile)

    result_queue: "queue.Queue" = queue.Queue()

    def worker():
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=False)
                page = browser.new_page()
                page.goto(job["url"], wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(1500)

                fill_result = fill_form(page, ctx)
                result_queue.put(("ok", fill_result))

                try:
                    page.wait_for_event("close", timeout=0)
                except Exception:
                    pass
                try:
                    browser.close()
                except Exception:
                    pass
        except Exception as exc:  # surfaced to the HTTP caller below
            result_queue.put(("error", str(exc)))

    threading.Thread(target=worker, daemon=True).start()

    status, payload = result_queue.get(timeout=fill_timeout)
    if status == "error":
        raise RuntimeError(payload)
    payload["url"] = job["url"]
    return payload


def _pick_file(*candidates: Optional[str]) -> Optional[str]:
    for c in candidates:
        if c and Path(c).exists():
            return str(Path(c).resolve())
    return None


def _read_text(path: Optional[str]) -> str:
    if not path or not Path(path).exists():
        return ""
    return Path(path).read_text(encoding="utf-8", errors="ignore")
