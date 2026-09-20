"""Best-effort, heuristic form-field filling.

This does NOT understand every job site. It looks at each visible input's
label/placeholder/name/id text and fills it if it recognizes the field
(name, email, phone, LinkedIn URL, resume/cover-letter file upload). Anything
it doesn't recognize is left alone for the human to fill in. It never touches
submit buttons -- the whole point is "fill what's safe to guess, let the
human verify and submit."
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class FillContext:
    name: str = ""
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    website: str = ""
    location: str = ""
    resume_file: Optional[str] = None
    cover_letter_file: Optional[str] = None
    cover_letter_text: str = ""


# (match keywords in label/name/placeholder/id, attribute on FillContext)
TEXT_FIELD_RULES = [
    (["first name", "firstname", "fname", "given name"], "first_name"),
    (["last name", "lastname", "lname", "surname", "family name"], "last_name"),
    (["full name", "your name"], "name"),
    (["email"], "email"),
    (["phone", "mobile", "telephone"], "phone"),
    (["linkedin"], "linkedin"),
    (["website", "portfolio", "github"], "website"),
    (["location", "city"], "location"),
]

FILE_FIELD_RULES = [
    (["resume", "cv"], "resume_file"),
    (["cover letter", "coverletter"], "cover_letter_file"),
]

COVER_LETTER_TEXTAREA_HINTS = ["cover letter", "why do you want", "additional information"]


def describe_field(page, element) -> str:
    """Build a lowercase haystack of label/placeholder/name/id/aria-label for an element."""
    parts = []
    for attr in ("name", "id", "placeholder", "aria-label"):
        try:
            value = element.get_attribute(attr)
        except Exception:
            value = None
        if value:
            parts.append(value)
    try:
        el_id = element.get_attribute("id")
        if el_id:
            label = page.query_selector(f'label[for="{el_id}"]')
            if label:
                parts.append(label.inner_text())
    except Exception:
        pass
    return " ".join(parts).lower()


def fill_form(page, ctx: FillContext) -> dict:
    """Fill recognizable fields on the currently loaded page. Returns a
    summary dict of what was filled vs skipped, for the CLI to report."""
    filled, skipped = [], []

    inputs = page.query_selector_all("input, textarea")
    for element in inputs:
        try:
            input_type = (element.get_attribute("type") or "text").lower()
            tag = element.evaluate("el => el.tagName.toLowerCase()")
        except Exception:
            continue

        if input_type in ("hidden", "submit", "button", "checkbox", "radio"):
            continue

        haystack = describe_field(page, element)
        if not haystack:
            continue

        if input_type == "file":
            handled = _try_fill_file(element, haystack, ctx, filled)
            if not handled:
                skipped.append(f"file field ({haystack[:40]})")
            continue

        if tag == "textarea" and any(h in haystack for h in COVER_LETTER_TEXTAREA_HINTS):
            if ctx.cover_letter_text:
                try:
                    element.fill(ctx.cover_letter_text)
                    filled.append(f"cover letter textarea ({haystack[:40]})")
                    continue
                except Exception:
                    pass

        value = _match_text_field(haystack, ctx)
        if value:
            try:
                element.fill(value)
                filled.append(f"{haystack[:40]} -> {value[:30]}")
            except Exception:
                skipped.append(f"{haystack[:40]} (fill failed)")

    return {"filled": filled, "skipped": skipped}


def _match_text_field(haystack: str, ctx: FillContext) -> str:
    for keywords, attr in TEXT_FIELD_RULES:
        if any(k in haystack for k in keywords):
            value = getattr(ctx, attr, "")
            if value:
                return value
    return ""


def _try_fill_file(element, haystack: str, ctx: FillContext, filled: list) -> bool:
    for keywords, attr in FILE_FIELD_RULES:
        if any(k in haystack for k in keywords):
            path = getattr(ctx, attr, None)
            if path:
                try:
                    element.set_input_files(path)
                    filled.append(f"{haystack[:40]} -> {path}")
                    return True
                except Exception:
                    return False
    return False
