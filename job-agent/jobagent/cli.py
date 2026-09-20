"""Personal job application agent -- CLI entry point."""
import click
from rich.console import Console
from rich.table import Table

from . import db, matcher, tailor, tracker
from .profile import Profile, load_profile, save_profile
from .sources import ALL_SOURCES

console = Console()


@click.group()
def main():
    """jobagent: find, score, tailor for, and (semi-)apply to jobs."""


@main.command()
def init():
    """Interactively create your profile (data/profile.yaml)."""
    console.print("[bold]Let's set up your job-search profile.[/bold]")
    profile = Profile(
        name=click.prompt("Full name"),
        email=click.prompt("Email"),
        phone=click.prompt("Phone", default="", show_default=False),
        linkedin=click.prompt("LinkedIn URL", default="", show_default=False),
        website=click.prompt("Personal website / portfolio", default="", show_default=False),
        location=click.prompt("Current location (city, country)", default="", show_default=False),
        resume_path=click.prompt("Path to your resume file (.pdf, .docx, .md, or .txt)"),
        target_titles=_split(click.prompt("Target job titles (comma-separated)", default="")),
        target_locations=_split(click.prompt("Target locations (comma-separated, or 'remote')", default="remote")),
        remote_only=click.confirm("Remote only?", default=True),
        keywords=_split(click.prompt("Keywords/skills you want jobs to match (comma-separated)", default="")),
        excluded_companies=_split(click.prompt("Companies to exclude (comma-separated)", default="")),
        min_salary=click.prompt("Minimum acceptable salary (0 for no preference)", default=0, type=int),
        years_experience=click.prompt("Years of experience", default=0, type=int),
    )
    save_profile(profile)
    console.print(f"[green]Saved profile to data/profile.yaml[/green]")
    console.print(
        "Next: copy .env.example to .env and add your LLM API key, then run "
        "`jobagent search`."
    )


@main.command()
@click.option("--query", default="", help="Search keywords (defaults to your target titles).")
@click.option("--location", default="", help="Location filter.")
@click.option("--limit", default=25, help="Max results per source.")
def search(query, location, limit):
    """Pull job listings from configured sources into the local database."""
    profile = load_profile()
    query = query or " ".join(profile.target_titles)
    location = location or ("remote" if profile.remote_only else "")

    total_new = 0
    for source in ALL_SOURCES:
        jobs = source.search(query=query, location=location, limit=limit)
        new_count = sum(1 for job in jobs if db.upsert_job(job))
        total_new += new_count
        console.print(f"[cyan]{source.name}[/cyan]: {len(jobs)} fetched, {new_count} new")

    console.print(f"[bold green]{total_new} new job(s) saved.[/bold green] Run `jobagent match` next.")


@main.command()
@click.option("--min-score", default=60.0, help="Minimum score (0-100) to mark a job 'matched'.")
@click.option("--status", "status_filter", default="new", help="Which status bucket to score.")
def match(min_score, status_filter):
    """Score pending jobs against your resume/preferences with the LLM."""
    profile = load_profile()
    results = matcher.match_pending(profile, min_score=min_score, status_filter=status_filter)
    if not results:
        console.print("No jobs to score. Run `jobagent search` first.")
        return
    table = Table(title="Match results")
    table.add_column("Score", justify="right")
    table.add_column("Title")
    table.add_column("Company")
    table.add_column("Job ID")
    for job_id, title, company, score in sorted(results, key=lambda r: -r[3]):
        table.add_row(f"{score:.0f}", title, company, job_id)
    console.print(table)


@main.command(name="list")
@click.option("--status", default=None, help="Filter by status (new/matched/tailored/applied/...).")
def list_cmd(status):
    """List jobs in the local database."""
    jobs = db.list_jobs(status=status)
    table = Table(title=f"Jobs ({status or 'all'})")
    table.add_column("Score", justify="right")
    table.add_column("Status")
    table.add_column("Title")
    table.add_column("Company")
    table.add_column("Job ID")
    for job in jobs:
        score = f"{job['match_score']:.0f}" if job["match_score"] is not None else "-"
        table.add_row(score, job["status"], job["title"], job["company"], job["id"])
    console.print(table)


@main.command()
@click.argument("job_id")
def show(job_id):
    """Show full details for one job."""
    job = db.get_job(job_id)
    if job is None:
        raise click.ClickException(f"No job found with id '{job_id}'")
    console.print(f"[bold]{job['title']}[/bold] @ {job['company']}")
    console.print(f"Location: {job['location']}   Salary: {job['salary'] or 'n/a'}")
    console.print(f"URL: {job['url']}")
    console.print(f"Status: {job['status']}   Score: {job['match_score']}")
    if job["match_reasoning"]:
        console.print(f"\n[italic]{job['match_reasoning']}[/italic]")
    console.print(f"\n{job['description'][:2000]}")


@main.command(name="tailor")
@click.argument("job_id")
def tailor_job_cmd(job_id):
    """Generate a tailored resume + cover letter for a specific job."""
    profile = load_profile()
    resume_path, cover_letter_path = tailor.tailor_job(job_id, profile)
    console.print(f"[green]Tailored resume:[/green] {resume_path}")
    console.print(f"[green]Tailored cover letter:[/green] {cover_letter_path}")


@main.command()
@click.argument("job_id")
def apply(job_id):
    """Open the job posting in a real browser and autofill what it can.

    This never submits the application for you -- you review and click
    submit yourself in the browser window.
    """
    from .autofill import autofill_application

    profile = load_profile()
    autofill_application(job_id, profile)

    if click.confirm("Did you submit the application?", default=False):
        note = click.prompt("Any notes to save", default="", show_default=False)
        db.update_status(job_id, "applied", note)
        console.print("[green]Marked as applied.[/green]")
    else:
        console.print("Left status unchanged. Re-run `jobagent apply` when you're ready.")


@main.command()
@click.argument("job_id")
@click.argument("new_status")
@click.option("--note", default="", help="Optional note to attach.")
def status(job_id, new_status, note):
    """Manually update a job's tracking status.

    Valid statuses: new, matched, ignored, tailored, applied, interviewing,
    offer, rejected, declined.
    """
    tracker.set_status(job_id, new_status, note)
    console.print(f"[green]{job_id}[/green] -> {new_status}")


@main.command()
def stats():
    """Show a summary of your pipeline by status, and any follow-ups due."""
    counts = tracker.summary()
    table = Table(title="Pipeline")
    table.add_column("Status")
    table.add_column("Count", justify="right")
    for status_name, count in counts.items():
        table.add_row(status_name, str(count))
    console.print(table)

    stale = tracker.needs_follow_up()
    if stale:
        console.print(f"\n[yellow]{len(stale)} application(s) may need a follow-up:[/yellow]")
        for job in stale:
            console.print(f"  - {job['title']} @ {job['company']} (applied {job['applied_at']})")


def _split(raw: str) -> list:
    return [part.strip() for part in raw.split(",") if part.strip()]


if __name__ == "__main__":
    main()
