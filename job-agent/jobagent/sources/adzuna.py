"""Adzuna job search API (free tier, requires app_id + app_key).
https://developer.adzuna.com/
"""
from typing import List

import requests

from .. import config
from ..db import Job
from .base import JobSource


class AdzunaSource(JobSource):
    name = "adzuna"

    def search(self, query: str, location: str = "", limit: int = 25) -> List[Job]:
        if not (config.ADZUNA_APP_ID and config.ADZUNA_APP_KEY):
            return []  # optional source; silently skip if not configured

        url = f"https://api.adzuna.com/v1/api/jobs/{config.ADZUNA_COUNTRY}/search/1"
        params = {
            "app_id": config.ADZUNA_APP_ID,
            "app_key": config.ADZUNA_APP_KEY,
            "what": query,
            "where": location,
            "results_per_page": limit,
            "content-type": "application/json",
        }
        try:
            resp = requests.get(url, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError):
            return []

        jobs = []
        for item in data.get("results", [])[:limit]:
            jobs.append(
                Job(
                    id=f"adzuna:{item.get('id')}",
                    source=self.name,
                    title=item.get("title", ""),
                    company=(item.get("company") or {}).get("display_name", ""),
                    location=(item.get("location") or {}).get("display_name", ""),
                    url=item.get("redirect_url", ""),
                    description=item.get("description", ""),
                    salary=_salary_range(item),
                    posted_at=item.get("created", ""),
                )
            )
        return jobs


def _salary_range(item: dict) -> str:
    lo, hi = item.get("salary_min"), item.get("salary_max")
    if lo and hi:
        return f"${lo:,.0f} - ${hi:,.0f}"
    return ""
