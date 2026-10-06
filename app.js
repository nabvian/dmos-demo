// DMOS showcase. No DMOS code runs here: the gate order follows the published
// POC specification, and every message/report is recorded from a real run.
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SVG = "http://www.w3.org/2000/svg";
const data = await (await fetch("data/recorded.json")).json();
const S = data.scenarios;

// ---------- headline stats (POC_RESULT.md v0.1.0) ----------
$("#stats").innerHTML = [
  ["10 + 1", "typed refusals specified and reachable, plus the thin-film scope gate (F12)"],
  ["4", "reportability states, never collapsed into a boolean"],
  ["9", "pipeline stages, each naming the refusal it can emit"],
  ["0", "trained models contributing to any reported value"],
].map(([v, l]) => `<div class="stat"><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join("");

// ---------- pipeline ----------
const STAGES = [
  { id: "S0a", name: "Preparation", body: "The slide preparation is a required declaration, checked before anything else. An observation declared for thin film is not assessable on a thick film: the material is absent, so the repair is a new slide, not a better image.", codes: ["F12_PREPARATION_NOT_APPLICABLE"] },
  { id: "S0", name: "Intake gate", body: "Rejects images carrying burned-in identifiers and records carrying raw identifiers. It does not clean up: a detection is a rejection. In the POC the pixel-text detector is a fixture heuristic, and the report says so.", codes: ["F9 BurnedInIdentifier", "RawIdentifierLeak", "CustodyViolation"] },
  { id: "S1", name: "Pixel calibration", body: "Establishes whether a µm/pixel scale exists, came from a permitted source, is in date, and is scoped to the optical configuration actually used. With no valid scale every length and area downstream becomes Undetermined, not a pixel count wearing a µm label.", codes: ["F1 no calibration", "F1 prohibited source", "F2 expired", "F3 out of scope"] },
  { id: "S2", name: "Candidate selection", body: "Classical computer vision, no learned model: colour deconvolution, Otsu thresholds, distance transform and watershed, then area and solidity filters. Admission bounds are in µm², so selection refuses rather than falling back to pixel counts when there is no calibration.", codes: ["refuses without calibration"] },
  { id: "S3", name: "Morphometry", body: "Area, diameter, circularity, solidity and N:C ratio, each as a quantity with a declared unit or an absence with a reason. Absent inputs yield absences, never zeros; a fragmented object is absent rather than measured as its largest piece.", codes: ["F4 Absence (fragmented)", "F5 UndeclaredConvention"] },
  { id: "S4", name: "Evidence gate", body: "Where calibration is not valid and the observation requires it, the whole observation is NOT_ASSESSABLE however many metrics were individually computable. Suppressed-but-computable metrics are named, so nobody discovers the gap by noticing a blank field.", codes: ["§3.5 coarse gate"] },
  { id: "S5", name: "Aggregation", body: "Counts per-object labels against assessed red cells. Unlabelled and not-assessable objects are excluded from the denominator and counted separately; they are not evidence of absence. A label outside the declared vocabulary is refused rather than bucketed into “other”.", codes: ["F6 NewClaimIntroduced", "WrongDenominator"] },
  { id: "S6", name: "Reportability", body: "Resolves to REPORTABLE, NOT_REPORTABLE, NOT_ASSESSABLE or UNDETERMINED. “Assessed and negative”, “not enough cells to say” and “nobody declared the bar” are different answers and must never collapse into “normal”.", codes: ["F7 NOT_ASSESSABLE (0 of 0)", "F8 UNDETERMINED (no bar)"] },
  { id: "S7", name: "Seal", body: "Every stage appends an event to a hash-chained provenance log; the run is sealed. Verification names the first altered event, and appending after sealing raises.", codes: ["F10 TamperFinding"] },
  { id: "S8", name: "Finding", body: "Renders the structural finding and an overlay. A finding carries descriptor, scope, quantity and state, and nothing else: there is no slot for a diagnosis.", codes: ["Stated(value, unit, provenance)"] },
];
const stagesEl = $("#stages");
stagesEl.innerHTML = STAGES.map((s, i) => `<button type="button" class="stage" role="tab" aria-selected="${i === 0}" data-i="${i}"><b>${s.id}</b><span>${esc(s.name)}</span></button>`).join("");
const showStage = (i) => {
  stagesEl.querySelectorAll(".stage").forEach((b) => b.setAttribute("aria-selected", String(Number(b.dataset.i) === i)));
  const s = STAGES[i];
  $("#stage-detail").innerHTML = `<h3>${esc(s.id)} · ${esc(s.name)}</h3><p>${esc(s.body)}</p><div class="codes">${s.codes.map((c) => `<span class="code-chip">${esc(c)}</span>`).join("")}</div>`;
};
stagesEl.addEventListener("click", (e) => { const b = e.target.closest(".stage"); if (b) showStage(Number(b.dataset.i)); });
showStage(0);

// ---------- refusal explorer ----------
const form = $("#explorer-form");
const TRAIL = ["S0a", "S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
const stateRow = (label) => data.reportability.find((r) => r.scenario === label);
const STATE_TONE = { REPORTABLE: "good", NOT_REPORTABLE: "warn", UNDETERMINED: "neutral", NOT_ASSESSABLE: "bad" };

function decide(v) {
  if (v.prep === "THICK_FILM") return { stop: "S0a", code: "F12_PREPARATION_NOT_APPLICABLE", title: "Refused before anything was measured", tone: "bad", text: "The observation is declared for thin film; a thick film lyses the erythrocytes, so red-cell morphology is absent from the material.", repair: "Prepare and image a thin film.", report: S.thick_film.report_html };
  if (v.label_band) return { stop: "S0", code: data.f9.code, title: "Refused at intake; the pipeline never starts", tone: "bad", text: data.f9.message, repair: "Re-image without the slide label in frame. Uploads are screened before any measurement because a label can carry a patient name." };
  if (v.scale === "blank") return { stop: "S1", code: S.no_scale.code, title: "No observation was made", tone: "bad", text: "No pixel scale was declared, so no micron quantity can be computed and no candidate can be selected: the selector's bounds are in µm², a property of erythrocytes, not of a camera.", repair: "Declare a scale measured from a permitted artefact.", report: S.no_scale.report_html };
  if (v.source === "NAMEPLATE_MAGNIFICATION") return { stop: "S1", code: S.nameplate.code, title: "A scale from the nameplate is refused", tone: "bad", text: "A nameplate magnification is a nominal figure; the delivered magnification differs. Only a stage micrometer, an eyepiece graticule or a vendor declaration with provenance are permitted sources.", repair: "Measure the scale against a stage micrometer or graticule.", report: S.nameplate.report_html };
  if (v.when === "expired") return { stop: "S1", code: "F2 · NOT_ASSESSABLE", title: "Calibration is out of date", tone: "bad", text: data.calibration.expired.reasons.join(" "), repair: "Re-verify the calibration; the reason names the expiry date." };
  if (v.other_objective) return { stop: "S1", code: "F3 · NOT_ASSESSABLE", title: "Calibration is scoped, not global", tone: "bad", text: data.calibration.other_objective.reasons.join(" "), repair: "Calibrate this optical configuration; the system refuses rather than rescaling." };
  if (v.off_vocab) return { stop: "S5", code: "F6 · NewClaimIntroduced", title: "A new claim is refused", tone: "bad", text: data.off_vocabulary.refusal, repair: "Only categories an upstream task produces may be counted; there is no “other” bucket." };
  const row = v.no_objects ? stateRow("no objects") : v.bar === "" ? stateRow("bar undeclared") : v.bar === "5" ? stateRow("bar = 5, met") : stateRow("bar = 500, unmet");
  const why = row.reasons.length ? row.reasons.join(" ") : `${row.n} assessed cells meet the declared bar of ${row.bar}.`;
  const tone = STATE_TONE[row.state];
  return { stop: null, code: row.state, title: `Finding written · reportability ${row.state}`, tone, text: why, repair: row.state === "UNDETERMINED" ? "Declare the adequacy bar (decision D-AGG-01). There is no default." : row.state === "NOT_REPORTABLE" ? "More assessable cells are needed to meet the declared bar." : row.state === "NOT_ASSESSABLE" ? "0 of 0 is undefined, not 0%. Image a field with assessable cells." : null, state: row };
}

function renderExplorer() {
  const v = { prep: form.prep.value, label_band: form.label_band.checked, scale: form.scale.value, source: form.source.value, when: form.when.value, other_objective: form.other_objective.checked, off_vocab: form.off_vocab.checked, no_objects: form.no_objects.checked, bar: form.bar.value };
  form.source.disabled = v.scale === "blank";
  const d = decide(v);
  const stopAt = d.stop ? TRAIL.indexOf(d.stop) : TRAIL.length;
  $("#trail").innerHTML = TRAIL.map((s, i) => `<li class="${i < stopAt ? "pass" : i === stopAt ? "stop" : ""}">${s}${i === stopAt ? " ✗" : i < stopAt ? " ✓" : ""}</li>`).join("");
  const label = d.stop ? "REFUSED" : "REPORTED";
  $("#verdict").innerHTML = `<div class="verdict-head"><span class="pill ${d.stop ? "bad" : "good"}">${label}${d.stop ? ` at ${d.stop}` : ""}</span><code>${esc(d.code)}</code></div><h3>${esc(d.title)}</h3><p>${esc(d.text)}</p>${d.repair ? `<p class="repair"><b>Repair:</b> ${esc(d.repair)}</p>` : ""}
    ${d.state ? `<p class="muted small">Recorded with 8 labelled cells supplied to the aggregation stage, as in the POC's own tests: the stand-in selector produces no morphology labels by itself (no trained model), so the full field report below reads NOT_ASSESSABLE for the proportion.</p>` : ""}
    ${d.report ? `<details class="recorded"><summary>Show the full report the pipeline wrote</summary><div class="report">${d.report}</div></details>` : ""}
    <p class="muted small">Messages recorded from real runs of the DMOS POC (synthetic track, illustrative configuration).</p>`;
}
form.addEventListener("change", renderExplorer);
renderExplorer();

// ---------- recorded finding ----------
$("#report-reported").innerHTML = S.reported.report_html;

// ---------- four states ----------
const STATE_TEXT = { UNDETERMINED: "Eight cells is neither adequate nor inadequate until somebody states the bar.", REPORTABLE: "The declared bar is met, so the proportion may be reported.", NOT_REPORTABLE: "Checked against a declared bar, and the bar was not met.", NOT_ASSESSABLE: "There is no proportion to report: 0 of 0 is not 0%." };
$("#state-cards").innerHTML = data.reportability.map((r) => `<article class="state-card"><span class="pill ${STATE_TONE[r.state]}">${esc(r.state)}</span><h3>${esc(r.scenario)}</h3><dl><dt>assessed</dt><dd>${r.n}</dd><dt>bar</dt><dd>${r.bar ?? "not declared"}</dd></dl><p>${esc(STATE_TEXT[r.state])}</p>${r.reasons.length ? `<p><code>${esc(r.reasons[0])}</code></p>` : ""}</article>`).join("");

// ---------- seal / tamper replay ----------
const t = data.tamper;
// Event kinds as appended by the POC's build_log (this run aggregated, so event 5 is AGGREGATED).
const EVENT_NAMES = ["CONFIG_DECLARED", "CALIBRATION_EVALUATED", "OBJECTS_SELECTED", "OBSERVATION_RESOLVED", "AGGREGATED", "REPORTABILITY_ASSESSED"];
const short = (h) => `${h.slice(0, 10)}…`;
function renderChain(tampered) {
  const m = /seq=(\d+), expected_hash='([0-9a-f]+)', found_hash='([0-9a-f]+)', detail='([^']+)'/.exec(t.finding) ?? [];
  const brokenSeq = Number(m[1] ?? 5);
  const rows = Array.from({ length: t.events }, (_, i) => {
    // seq is 0-based in the log: editing position 4 breaks the link checked at position 5.
    const seq = i + 1, altered = tampered && i === t.mutated_event_index, broken = tampered && i === brokenSeq && !altered;
    return `<div class="event ${altered ? "altered" : ""} ${broken ? "broken" : ""}"><span class="n">${seq}</span><span><code>${esc(EVENT_NAMES[i] ?? `event ${seq}`)}</code>${altered ? ` · <b>${esc(t.mutation)}</b>` : ""}</span><span class="h">${broken ? "predecessor hash differs" : altered ? "edited after sealing" : "linked"}</span></div>`;
  }).join("");
  const line = tampered
    ? `<div class="seal-line bad">✗ TamperFinding · detected at the next link (event ${brokenSeq + 1}): predecessor hash differs<br><code>expected ${esc(short(m[2] ?? ""))} · found ${esc(short(m[3] ?? ""))}</code></div>`
    : `<div class="seal-line ok">✓ Seal verifies: ${t.events} events, chain intact</div>`;
  $("#chain").innerHTML = rows + line;
}
renderChain(false);
let tampered = false;
$("#tamper-button").addEventListener("click", () => {
  tampered = !tampered;
  $("#tamper-button").textContent = tampered ? "Restore the sealed record" : "Alter one value in event 5";
  renderChain(tampered);
});

// ---------- failure chart (POC_RESULT.md §5) ----------
const FAILURE = [
  { axis: "defocus", ordinary: 3.05, gated: 1.56, caught: "acquisition sharpness" },
  { axis: "noise", ordinary: 1.47, gated: 0.04, caught: "selection agreement" },
  { axis: "stain", ordinary: 0.55, gated: 0.55, caught: "selection agreement, then S2 refuses outright" },
];
function el(name, attrs, parent) { const n = document.createElementNS(SVG, name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent?.appendChild(n); return n; }
function drawFailure() {
  const c = $("#chart-failure"); c.innerHTML = "";
  const width = Math.max(280, c.clientWidth || 480), lw = 76, rowH = 58, h = FAILURE.length * rowH + 30, max = 3.5;
  const svg = el("svg", { viewBox: `0 0 ${width} ${h}`, role: "img", "aria-label": "Worst area error by degradation axis, ordinary versus evidence-gated" }, c);
  const x = (v) => lw + (v / max) * (width - lw - 64);
  for (const tick of [0, 1, 2, 3]) {
    el("line", { class: "gridline", x1: x(tick), x2: x(tick), y1: 0, y2: h - 24 }, svg);
    el("text", { x: x(tick), y: h - 6, "text-anchor": "middle" }, svg).textContent = `${tick} µm²`;
  }
  const tip = document.createElement("div"); tip.className = "tooltip"; tip.hidden = true; c.appendChild(tip);
  FAILURE.forEach((r, i) => {
    const y = i * rowH + 6;
    el("text", { x: lw - 10, y: y + 22, "text-anchor": "end", class: "strong" }, svg).textContent = r.axis;
    [["ordinary", "var(--series-2)", 0], ["gated", "var(--series-1)", 22]].forEach(([k, color, dy]) => {
      const w = Math.max(2, x(r[k]) - lw);
      el("path", { d: `M${lw},${y + dy} H${lw + w - 3} Q${lw + w},${y + dy} ${lw + w},${y + dy + 3} V${y + dy + 15} Q${lw + w},${y + dy + 18} ${lw + w - 3},${y + dy + 18} H${lw} Z`, fill: color }, svg);
      el("text", { x: lw + w + 6, y: y + dy + 14 }, svg).textContent = r[k].toFixed(2);
    });
    const hit = el("rect", { x: 0, y: y - 4, width, height: rowH - 4, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", (e) => { const b = c.getBoundingClientRect(); tip.hidden = false; tip.innerHTML = `<b>${r.axis}</b><br><span class="k">ordinary</span> ${r.ordinary} µm²<br><span class="k">gated</span> ${r.gated} µm²<br><span class="k">caught by</span> ${esc(r.caught)}`; tip.style.left = `${Math.min(e.clientX - b.left + 12, b.width - tip.offsetWidth)}px`; tip.style.top = `${e.clientY - b.top - tip.offsetHeight - 10}px`; });
    hit.addEventListener("pointerleave", () => { tip.hidden = true; });
  });
}
drawFailure();
new ResizeObserver(drawFailure).observe($("#chart-failure"));
$("#table-failure").innerHTML = `<table><thead><tr><th>axis</th><th class="num">ordinary</th><th class="num">gated</th><th>caught by</th></tr></thead><tbody>${FAILURE.map((r) => `<tr><td>${r.axis}</td><td class="num">${r.ordinary} µm²</td><td class="num">${r.gated} µm²</td><td>${esc(r.caught)}</td></tr>`).join("")}</tbody></table>`;

// ---------- tests and decisions (POC_RESULT.md §2, §9) ----------
$("#tests").innerHTML = [["189", "dmos-core (Rust, 13 crates)"], ["237", "dmos-engineering (Python)"], ["88", "POC"]].map(([n, l]) => `<div><strong>${n}</strong><span>${l}</span></div>`).join("");
$("#decisions").innerHTML = ["D-CAL-01", "D-AGG-01", "D-ORCH-01", "D-ORCH-02", "D-SCALE-01", "D-JOB-01", "D-JOB-02", "D-REG-01", "D-MASK-01"].map((d) => `<span>${d}</span>`).join("");
