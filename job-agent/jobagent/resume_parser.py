"""Extract plain text from a resume file (PDF, DOCX, or plain text/markdown)."""
from pathlib import Path


def extract_text(path: str) -> str:
    p = Path(path).expanduser()
    if not p.exists():
        raise FileNotFoundError(f"Resume file not found: {p}")

    suffix = p.suffix.lower()
    if suffix == ".pdf":
        return _extract_pdf(p)
    if suffix == ".docx":
        return _extract_docx(p)
    return p.read_text(encoding="utf-8", errors="ignore")


def _extract_pdf(p: Path) -> str:
    import pdfplumber

    text_parts = []
    with pdfplumber.open(p) as pdf:
        for page in pdf.pages:
            text_parts.append(page.extract_text() or "")
    return "\n".join(text_parts)


def _extract_docx(p: Path) -> str:
    import docx

    document = docx.Document(str(p))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)
