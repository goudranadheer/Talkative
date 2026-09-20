"""Load/save the user's job-search profile (data/profile.yaml)."""
from dataclasses import asdict, dataclass, field
from typing import List

import yaml

from . import config


@dataclass
class Profile:
    name: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    website: str = ""
    location: str = ""
    resume_path: str = ""
    target_titles: List[str] = field(default_factory=list)
    target_locations: List[str] = field(default_factory=list)
    remote_only: bool = False
    keywords: List[str] = field(default_factory=list)
    excluded_companies: List[str] = field(default_factory=list)
    min_salary: int = 0
    years_experience: int = 0
    summary: str = ""

    def resume_text(self) -> str:
        from .resume_parser import extract_text

        if not self.resume_path:
            raise ValueError("No resume_path set in profile. Run `jobagent init` first.")
        return extract_text(self.resume_path)


def load_profile() -> Profile:
    if not config.PROFILE_PATH.exists():
        raise FileNotFoundError(
            f"No profile found at {config.PROFILE_PATH}. Run `jobagent init` first."
        )
    data = yaml.safe_load(config.PROFILE_PATH.read_text()) or {}
    return Profile(**data)


def save_profile(profile: Profile) -> None:
    config.ensure_dirs()
    config.PROFILE_PATH.write_text(yaml.safe_dump(asdict(profile), sort_keys=False))
