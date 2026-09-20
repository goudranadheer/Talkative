"""Score fetched job candidates against the user's resume + preferences."""
import json
import re

from . import db, llm
from .profile import Profile

SYSTEM_PROMPT = (
    "You are a careful, honest job-fit evaluator helping a candidate decide which "
    "job postings are worth applying to. You never inflate scores to be encouraging."
)

PROMPT_TEMPLATE = """\
Evaluate how well this candidate fits the job posting below. Consider required
skills/experience, seniority level, location/remote constraints, and any stated
preferences. Be critical -- a generic or weak match should score low.

CANDIDATE RESUME:
---
{resume}
---

CANDIDATE PREFERENCES:
- Target titles: {titles}
- Target locations: {locations}
- Remote only: {remote_only}
- Keywords of interest: {keywords}
- Minimum acceptable salary: {min_salary}
- Excluded companies: {excluded}

JOB POSTING:
Title: {job_title}
Company: {job_company}
Location: {job_location}
Salary: {job_salary}
Description:
{job_description}
---

Respond with ONLY a JSON object (no markdown fences, no extra text):
{{"score": <integer 0-100>, "reasoning": "<2-3 sentence explanation>"}}
"""


def _parse_response(raw: str) -> tuple[float, str]:
    cleaned = re.sub(r"^```(json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    try:
        data = json.loads(cleaned)
        return float(data["score"]), str(data["reasoning"])
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        return 0.0, f"Could not parse LLM response: {raw[:200]}"


def score_job(job, profile: Profile, resume_text: str) -> tuple[float, str]:
    prompt = PROMPT_TEMPLATE.format(
        resume=resume_text[:6000],
        titles=", ".join(profile.target_titles) or "any",
        locations=", ".join(profile.target_locations) or "any",
        remote_only=profile.remote_only,
        keywords=", ".join(profile.keywords) or "none specified",
        min_salary=profile.min_salary or "not specified",
        excluded=", ".join(profile.excluded_companies) or "none",
        job_title=job["title"],
        job_company=job["company"],
        job_location=job["location"],
        job_salary=job["salary"],
        job_description=(job["description"] or "")[:4000],
    )
    raw = llm.chat(prompt, system=SYSTEM_PROMPT, max_tokens=400)
    return _parse_response(raw)


def match_pending(profile: Profile, min_score: float = 0, status_filter: str = "new") -> list:
    """Score all jobs with the given status, update DB, return list of (job, score)."""
    resume_text = profile.resume_text()
    jobs = db.list_jobs(status=status_filter)
    results = []
    for job in jobs:
        score, reasoning = score_job(job, profile, resume_text)
        new_status = "matched" if score >= min_score else "ignored"
        db.update_match(job["id"], score, reasoning, new_status)
        results.append((job["id"], job["title"], job["company"], score))
    return results
