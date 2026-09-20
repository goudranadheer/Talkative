"""Remotive.com public job API (no key required).
https://remotive.com/api-documentation
"""
from typing import List

import requests

from ..db import Job
from .base import JobSource


class RemotiveSource(JobSource):
    name = "remotive"
    API_URL = "https://remotive.com/api/remote-jobs"

    def search(self, query: str, location: str = "", limit: int = 25) -> List[Job]:
        try:
            resp = requests.get(
                self.API_URL, params={"search": query, "limit": limit}, timeout=15
            )
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError):
            return []

        jobs = []
        for item in data.get("jobs", [])[:limit]:
            jobs.append(
                Job(
                    id=f"remotive:{item.get('id')}",
                    source=self.name,
                    title=item.get("title", ""),
                    company=item.get("company_name", ""),
                    location=item.get("candidate_required_location", ""),
                    url=item.get("url", ""),
                    description=item.get("description", ""),
                    salary=item.get("salary", ""),
                    posted_at=item.get("publication_date", ""),
                )
            )
        return jobs
