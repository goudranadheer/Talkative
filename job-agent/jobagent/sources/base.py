"""Common interface for job sources."""
from abc import ABC, abstractmethod
from typing import List

from ..db import Job


class JobSource(ABC):
    name: str = "base"

    @abstractmethod
    def search(self, query: str, location: str = "", limit: int = 25) -> List[Job]:
        """Return a list of normalized Job objects. Should never raise on
        network/API errors -- callers treat a source failure as "no results"
        so one flaky source doesn't kill a multi-source search."""
        raise NotImplementedError
