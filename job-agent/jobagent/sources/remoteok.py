"""RemoteOK public job feed (no key required).
https://remoteok.com/api
"""
from typing import List

import requests

from ..db import Job
from .base import JobSource


class RemoteOKSource(JobSource):
    name = "remoteok"
    API_URL = "https://remoteok.com/api"

    def search(self, query: str, location: str = "", limit: int = 25) -> List[Job]:
        try:
            resp = requests.get(
                self.API_URL,
                headers={"User-Agent": "jobagent-personal-cli/1.0"},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError):
            return []

        # First element is metadata, not a job.
        items = [d for d in data if isinstance(d, dict) and d.get("id")]
        query_lower = query.lower().strip()

        jobs = []
        for item in items:
            haystack = f"{item.get('position', '')} {item.get('description', '')}".lower()
            if query_lower and query_lower not in haystack:
                continue
            jobs.append(
                Job(
                    id=f"remoteok:{item.get('id')}",
                    source=self.name,
                    title=item.get("position", ""),
                    company=item.get("company", ""),
                    location=item.get("location", "Remote"),
                    url=item.get("url", "") or f"https://remoteok.com/l/{item.get('id')}",
                    description=item.get("description", ""),
                    salary=_salary_range(item),
                    posted_at=item.get("date", ""),
                )
            )
            if len(jobs) >= limit:
                break
        return jobs


def _salary_range(item: dict) -> str:
    lo, hi = item.get("salary_min"), item.get("salary_max")
    if lo and hi:
        return f"${lo:,} - ${hi:,}"
    return ""
