"""FastAPI backend for the jobagent web dashboard.

Thin HTTP layer over the existing `jobagent` package -- every endpoint here
just calls the same functions the CLI uses (jobagent.db, .matcher, .tailor,
.tracker, .profile, .sources, .autofill), so behavior stays identical
between `jobagent <command>` and the web UI.

Run with: uvicorn web.server:app --reload --port 8420   (from job-agent/)
"""
import sys
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jobagent import config, db, llm, matcher, tailor, tracker  # noqa: E402
from jobagent.profile import Profile, load_profile, save_profile  # noqa: E402
from jobagent.sources import ALL_SOURCES  # noqa: E402

app = FastAPI(title="jobagent")

STATIC_DIR = Path(__file__).resolve().parent / "static"


def job_to_dict(row) -> dict:
    return {key: row[key] for key in row.keys()}


@app.exception_handler(FileNotFoundError)
async def not_found_handler(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(llm.LLMError)
async def llm_error_handler(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=400, content={"detail": str(exc)})


# ---------------------------------------------------------------- profile --

class ProfileIn(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    website: str = ""
    location: str = ""
    resume_path: str = ""
    target_titles: List[str] = []
    target_locations: List[str] = []
    remote_only: bool = False
    keywords: List[str] = []
    excluded_companies: List[str] = []
    min_salary: int = 0
    years_experience: int = 0
    summary: str = ""


@app.get("/api/profile")
def get_profile():
    try:
        profile = load_profile()
    except FileNotFoundError:
        return {"exists": False}
    data = profile.__dict__.copy()
    data["exists"] = True
    return data


@app.put("/api/profile")
def put_profile(body: ProfileIn):
    profile = Profile(**body.model_dump())
    save_profile(profile)
    return {"ok": True}


@app.post("/api/profile/resume")
async def upload_resume(file: UploadFile = File(...)):
    config.ensure_dirs()
    dest = config.DATA_DIR / f"resume{Path(file.filename).suffix}"
    content = await file.read()
    dest.write_bytes(content)

    try:
        profile = load_profile()
    except FileNotFoundError:
        profile = Profile()
    profile.resume_path = str(dest)
    save_profile(profile)
    return {"resume_path": str(dest)}


# ------------------------------------------------------------------ jobs --

class SearchIn(BaseModel):
    query: str = ""
    location: str = ""
    limit: int = 25


@app.post("/api/search")
def search(body: SearchIn):
    profile = load_profile()
    query = body.query or " ".join(profile.target_titles)
    location = body.location or ("remote" if profile.remote_only else "")

    per_source = []
    total_new = 0
    for source in ALL_SOURCES:
        jobs = source.search(query=query, location=location, limit=body.limit)
        new_count = sum(1 for job in jobs if db.upsert_job(job))
        total_new += new_count
        per_source.append({"source": source.name, "fetched": len(jobs), "new": new_count})

    return {"per_source": per_source, "total_new": total_new}


class MatchIn(BaseModel):
    min_score: float = 60.0
    status_filter: str = "new"


@app.post("/api/match")
def match(body: MatchIn):
    profile = load_profile()
    results = matcher.match_pending(
        profile, min_score=body.min_score, status_filter=body.status_filter
    )
    return {
        "results": [
            {"id": r[0], "title": r[1], "company": r[2], "score": r[3]} for r in results
        ]
    }


@app.get("/api/jobs")
def list_jobs(status: Optional[str] = None):
    return [job_to_dict(row) for row in db.list_jobs(status=status)]


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = db.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job found with id '{job_id}'")
    return job_to_dict(job)


class StatusIn(BaseModel):
    status: str
    note: str = ""


@app.post("/api/jobs/{job_id}/status")
def set_status(job_id: str, body: StatusIn):
    tracker.set_status(job_id, body.status, body.note)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/tailor")
def tailor_job(job_id: str):
    profile = load_profile()
    resume_path, cover_letter_path = tailor.tailor_job(job_id, profile)
    return {
        "resume": Path(resume_path).read_text(encoding="utf-8"),
        "cover_letter": Path(cover_letter_path).read_text(encoding="utf-8"),
        "resume_path": resume_path,
        "cover_letter_path": cover_letter_path,
    }


@app.get("/api/jobs/{job_id}/tailor")
def get_tailored(job_id: str):
    job = db.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job found with id '{job_id}'")
    resume_path = job["tailored_resume_path"]
    cover_letter_path = job["tailored_cover_letter_path"]
    if not resume_path:
        return {"tailored": False}
    return {
        "tailored": True,
        "resume": Path(resume_path).read_text(encoding="utf-8"),
        "cover_letter": Path(cover_letter_path).read_text(encoding="utf-8"),
    }


@app.post("/api/jobs/{job_id}/apply")
async def apply_job(job_id: str):
    """Opens a real, visible browser on this machine and autofills what it
    can. It never submits for you -- review the fields and submit yourself
    in the browser window, then update the status once you're done."""
    from jobagent.autofill.browser import autofill_application_async

    profile = load_profile()
    result = await run_in_threadpool(autofill_application_async, job_id, profile)
    return result


# ------------------------------------------------------------------ stats --

@app.get("/api/stats")
def stats():
    counts = tracker.summary()
    stale = tracker.needs_follow_up()
    return {
        "counts": counts,
        "follow_ups": [
            {"id": job["id"], "title": job["title"], "company": job["company"],
             "applied_at": job["applied_at"]}
            for job in stale
        ],
    }


# ---------------------------------------------------------------- static --

app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
