/* jobagent web dashboard -- vanilla JS, talks to the FastAPI backend at /api/* */

const API = "/api";

const state = {
  profile: null,
  jobs: [],
  statusFilter: "",
  selectedJobId: null,
};

// ---------------------------------------------------------------- utils --

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function toast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: opts.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...opts,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const detail = (data && data.detail) || res.statusText;
    throw new Error(detail);
  }
  return data;
}

function withLoading(btn, fn) {
  return async (...args) => {
    btn.classList.add("loading");
    btn.disabled = true;
    try {
      await fn(...args);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  };
}

function openModal(id) { $(`#${id}`).classList.add("open"); }
function closeModal(id) { $(`#${id}`).classList.remove("open"); }

$all("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
$all(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.classList.remove("open");
  });
});

// ------------------------------------------------------------- profile --

async function loadProfile() {
  const data = await api("/profile");
  const chip = $("#profile-chip");
  const chipText = $("#profile-chip-text");
  if (data.exists) {
    state.profile = data;
    chip.classList.add("online");
    chipText.textContent = `${data.name || "candidate"} online`;
    fillProfileForm(data);
  } else {
    state.profile = null;
    chip.classList.remove("online");
    chipText.textContent = "no profile loaded";
    openModal("profile-modal");
  }
}

function fillProfileForm(data) {
  const form = $("#profile-form");
  form.name.value = data.name || "";
  form.email.value = data.email || "";
  form.phone.value = data.phone || "";
  form.linkedin.value = data.linkedin || "";
  form.website.value = data.website || "";
  form.location.value = data.location || "";
  form.target_titles.value = (data.target_titles || []).join(", ");
  form.target_locations.value = (data.target_locations || []).join(", ");
  form.remote_only.value = data.remote_only ? "true" : "false";
  form.min_salary.value = data.min_salary || 0;
  form.keywords.value = (data.keywords || []).join(", ");
  form.excluded_companies.value = (data.excluded_companies || []).join(", ");
  form.years_experience.value = data.years_experience || 0;
  if (data.resume_path) {
    $("#resume-path-display").textContent = `current: ${data.resume_path}`;
  }
}

function splitCsv(value) {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

$("#btn-edit-profile").addEventListener("click", () => openModal("profile-modal"));

$("#profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const resumeFile = $("#resume-file").files[0];

  let resumePath = state.profile ? state.profile.resume_path : "";
  if (resumeFile) {
    const fd = new FormData();
    fd.append("file", resumeFile);
    const res = await api("/profile/resume", { method: "POST", body: fd });
    resumePath = res.resume_path;
  }

  if (!resumePath) {
    toast("Please attach a resume file (first time setup requires one).", "error");
    return;
  }

  const body = {
    name: form.name.value,
    email: form.email.value,
    phone: form.phone.value,
    linkedin: form.linkedin.value,
    website: form.website.value,
    location: form.location.value,
    resume_path: resumePath,
    target_titles: splitCsv(form.target_titles.value),
    target_locations: splitCsv(form.target_locations.value),
    remote_only: form.remote_only.value === "true",
    keywords: splitCsv(form.keywords.value),
    excluded_companies: splitCsv(form.excluded_companies.value),
    min_salary: parseInt(form.min_salary.value || "0", 10),
    years_experience: parseInt(form.years_experience.value || "0", 10),
    summary: "",
  };

  try {
    await api("/profile", { method: "PUT", body: JSON.stringify(body) });
    toast("Profile saved.", "success");
    closeModal("profile-modal");
    await loadProfile();
  } catch (err) {
    toast(err.message, "error");
  }
});

// ------------------------------------------------------------ jobs/grid --

function scoreClass(score) {
  if (score === null || score === undefined) return "score-none";
  if (score >= 75) return "score-high";
  if (score >= 50) return "score-mid";
  return "score-low";
}

function renderJobs() {
  const grid = $("#job-grid");
  const jobs = state.jobs;
  if (!jobs.length) {
    grid.innerHTML = `<p class="muted empty-state">No jobs in this view. Try Search, or pick a different status tab.</p>`;
    return;
  }
  grid.innerHTML = jobs.map((job) => `
    <div class="job-card" data-id="${escapeAttr(job.id)}">
      <div class="job-card-top">
        <span class="job-score ${scoreClass(job.match_score)}">${job.match_score !== null && job.match_score !== undefined ? Math.round(job.match_score) : "--"}</span>
        <span class="status-pill">${job.status}</span>
      </div>
      <div class="job-title">${escapeHtml(job.title)}</div>
      <div class="job-company">${escapeHtml(job.company || "Unknown company")}</div>
      <div class="job-meta">
        <span>${escapeHtml(job.location || "n/a")}</span>
        <span>${escapeHtml(job.salary || "")}</span>
        <span>${escapeHtml(job.source)}</span>
      </div>
    </div>
  `).join("");

  $all(".job-card").forEach((card) => {
    card.addEventListener("click", () => openJobDetail(card.dataset.id));
  });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
function escapeAttr(str) { return escapeHtml(str); }

async function loadJobs() {
  const qs = state.statusFilter ? `?status=${encodeURIComponent(state.statusFilter)}` : "";
  state.jobs = await api(`/jobs${qs}`);
  renderJobs();
}

$all(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $all(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.statusFilter = tab.dataset.status;
    loadJobs().catch((err) => toast(err.message, "error"));
  });
});

// -------------------------------------------------------- search/match --

const searchBtn = $("#btn-search");
searchBtn.addEventListener("click", withLoading(searchBtn, async () => {
  const body = {
    query: $("#search-query").value,
    location: $("#search-location").value,
    limit: 25,
  };
  const res = await api("/search", { method: "POST", body: JSON.stringify(body) });
  toast(`Found ${res.total_new} new job(s) across ${res.per_source.length} sources.`, "success");
  await loadJobs();
  await refreshStats();
}));

$("#match-min-score").addEventListener("input", (e) => {
  $("#match-min-score-val").textContent = e.target.value;
});

const matchBtn = $("#btn-match");
matchBtn.addEventListener("click", withLoading(matchBtn, async () => {
  const body = { min_score: parseFloat($("#match-min-score").value), status_filter: "new" };
  const res = await api("/match", { method: "POST", body: JSON.stringify(body) });
  toast(`Scored ${res.results.length} job(s).`, "success");
  await loadJobs();
}));

// ------------------------------------------------------------ job detail --

async function openJobDetail(jobId) {
  const job = await api(`/jobs/${encodeURIComponent(jobId)}`);
  state.selectedJobId = jobId;

  $("#job-modal-title").textContent = job.title;
  $("#job-modal-meta").innerHTML = `
    <span>${escapeHtml(job.company || "")}</span>
    <span>${escapeHtml(job.location || "")}</span>
    <span>${escapeHtml(job.salary || "n/a")}</span>
    <span><a href="${escapeAttr(job.url)}" target="_blank" rel="noopener" style="color:var(--cyan)">source posting &#8599;</a></span>
  `;
  $("#job-modal-score").innerHTML = job.match_score !== null && job.match_score !== undefined
    ? `<span class="job-score ${scoreClass(job.match_score)}">${Math.round(job.match_score)}</span> &nbsp; <span class="muted">${escapeHtml(job.match_reasoning || "")}</span>`
    : `<span class="muted">Not scored yet -- run "Score with AI" from the main view.</span>`;
  $("#job-modal-desc").textContent = job.description || "(no description)";

  $("#status-select").value = "";

  const tailored = await api(`/jobs/${encodeURIComponent(jobId)}/tailor`);
  if (tailored.tailored) {
    showTailored(tailored.resume, tailored.cover_letter);
  } else {
    $("#tailored-output").classList.add("hidden");
  }

  openModal("job-modal");
}

function showTailored(resume, coverLetter) {
  $("#tailored-resume").textContent = resume;
  $("#tailored-cover").textContent = coverLetter;
  $("#tailored-output").classList.remove("hidden");
}

const tailorBtn = $("#btn-tailor");
tailorBtn.addEventListener("click", withLoading(tailorBtn, async () => {
  if (!state.selectedJobId) return;
  const res = await api(`/jobs/${encodeURIComponent(state.selectedJobId)}/tailor`, { method: "POST" });
  showTailored(res.resume, res.cover_letter);
  toast("Tailored resume + cover letter generated.", "success");
  await loadJobs();
}));

const applyBtn = $("#btn-apply");
applyBtn.addEventListener("click", withLoading(applyBtn, async () => {
  if (!state.selectedJobId) return;
  toast("Opening browser and autofilling -- check your taskbar for the new window.", "info");
  const res = await api(`/jobs/${encodeURIComponent(state.selectedJobId)}/apply`, { method: "POST" });
  toast(`Filled ${res.filled.length} field(s), left ${res.skipped.length} for you. Review & submit in the browser window.`, "success");
}));

$("#status-select").addEventListener("change", async (e) => {
  const status = e.target.value;
  if (!status || !state.selectedJobId) return;
  try {
    await api(`/jobs/${encodeURIComponent(state.selectedJobId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note: "" }),
    });
    toast(`Status updated to "${status}".`, "success");
    await loadJobs();
    await refreshStats();
  } catch (err) {
    toast(err.message, "error");
  }
});

// ------------------------------------------------------------------ stats --

async function refreshStats() {
  const data = await api("/stats");
  const grid = $("#stats-grid");
  const entries = Object.entries(data.counts);
  grid.innerHTML = entries.length
    ? entries.map(([status, count]) => `
        <div class="stat-row">
          <span class="stat-label">${escapeHtml(status)}</span>
          <span class="stat-value">${count}</span>
        </div>`).join("")
    : `<p class="muted small">No data yet.</p>`;

  const followups = $("#followups");
  followups.innerHTML = data.follow_ups.length
    ? data.follow_ups.map((job) => `
        <div class="followup-item">
          <strong>${escapeHtml(job.title)}</strong> @ ${escapeHtml(job.company)}<br/>
          applied ${escapeHtml((job.applied_at || "").slice(0, 10))}
        </div>`).join("")
    : `<p class="muted">Nothing overdue.</p>`;
}

// -------------------------------------------------------------- init --

async function init() {
  initBackground();
  try { await loadProfile(); } catch (err) { toast(err.message, "error"); }
  try { await loadJobs(); } catch (err) { toast(err.message, "error"); }
  try { await refreshStats(); } catch (err) { toast(err.message, "error"); }
}

// ------------------------------------------------ animated particle bg --

function initBackground() {
  const canvas = $("#bg-canvas");
  const ctx = canvas.getContext("2d");
  let w, h, particles;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function makeParticles() {
    const count = Math.min(90, Math.floor((w * h) / 18000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.6,
    }));
  }

  function step() {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      ctx.beginPath();
      ctx.fillStyle = "rgba(79, 243, 255, 0.55)";
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 140) {
          ctx.strokeStyle = `rgba(120, 160, 255, ${0.12 * (1 - dist / 140)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(step);
  }

  window.addEventListener("resize", () => { resize(); makeParticles(); });
  resize();
  makeParticles();
  step();
}

init();
