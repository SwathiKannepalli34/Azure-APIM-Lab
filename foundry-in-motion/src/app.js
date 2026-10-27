"use strict";
const DOC = "https://learn.microsoft.com/en-us/azure/foundry/";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const fmt = (n, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

/* ---------- Motion and theme ---------- */
function applyMotion(state) {
  root.setAttribute("data-motion", state);
  localStorage.setItem("fim-motion", state);
  const on = state === "on";
  $("#motionBtn").setAttribute("aria-pressed", String(on));
  $("#motionLabel").textContent = on ? "Motion on" : "Motion off";
  if (!on) $$(".reveal").forEach(e => e.classList.add("in"));
}
$("#motionBtn").addEventListener("click", () => applyMotion(root.getAttribute("data-motion") === "on" ? "off" : "on"));
applyMotion(root.getAttribute("data-motion"));

function applyTheme(t) {
  root.setAttribute("data-theme", t);
  localStorage.setItem("fim-theme", t);
  $("#themeLabel").textContent = t === "dark" ? "Dark" : "Light";
}
$("#themeBtn").addEventListener("click", () => applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
applyTheme(root.getAttribute("data-theme") || "dark");

/* ---------- Navigation, scrollspy, progress ---------- */
const sections = $$("main .sec");
const nav = $("#nav");
let lastGroup = "";
sections.forEach((s, i) => {
  const g = s.dataset.group;
  if (g && g !== lastGroup) { nav.append(Object.assign(document.createElement("div"), { className: "grp", textContent: g })); lastGroup = g; }
  const a = Object.assign(document.createElement("a"), { href: "#" + s.id });
  const n = Object.assign(document.createElement("span"), { className: "n", textContent: String(i + 1).padStart(2, "0") });
  a.append(n, document.createTextNode(s.dataset.nav || s.id));
  a.addEventListener("click", () => $("#side").classList.remove("open"));
  nav.append(a);
});
const links = $$("#nav a");
const colors = { blue: "var(--blue)", violet: "var(--violet)", cyan: "var(--cyan)", amber: "var(--amber)", green: "var(--green)", rose: "var(--rose)" };
function spy() {
  let cur = sections[0];
  for (const s of sections) if (s.getBoundingClientRect().top < innerHeight * 0.35) cur = s;
  links.forEach((a, i) => {
    const on = sections[i] === cur;
    a.classList.toggle("on", on);
    if (on) { a.style.setProperty("--accent-nav", colors[cur.dataset.c] || colors.blue); }
  });
  $("#crumb").textContent = (cur.dataset.group ? cur.dataset.group + "  ›  " : "") + (cur.dataset.nav || "");
  const max = document.documentElement.scrollHeight - innerHeight;
  $("#progress").style.width = (max > 0 ? Math.min(100, (scrollY / max) * 100) : 0) + "%";
}
addEventListener("scroll", spy, { passive: true }); addEventListener("resize", spy); spy();
$("#burger").addEventListener("click", () => {
  const open = $("#side").classList.toggle("open");
  $("#burger").setAttribute("aria-expanded", String(open));
});

/* ---------- Reveal on scroll ---------- */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.08 });
$$(".sec-head, .card, .diagram, .tabs, .grid > *, .portal, .spectrum, .callout, .steps, .tbl-wrap, details").forEach(e => { e.classList.add("reveal"); io.observe(e); });
if (root.getAttribute("data-motion") === "off") $$(".reveal").forEach(e => e.classList.add("in"));

/* ---------- Tabs ---------- */
$$(".tabs").forEach(t => {
  const btns = $$(":scope > .tablist button", t), panels = $$(":scope > .tabpanel", t);
  btns.forEach((b, i) => b.addEventListener("click", () => {
    btns.forEach((x, j) => { x.setAttribute("aria-selected", String(i === j)); panels[j].hidden = i !== j; });
  }));
  btns[0].click();
});

/* ---------- Expand all ---------- */
let expanded = false;
$("#expandAll").addEventListener("click", e => {
  expanded = !expanded;
  $$("details").forEach(d => d.open = expanded);
  e.currentTarget.textContent = expanded ? "Collapse all" : "Expand all";
});

/* ---------- Copy buttons ---------- */
$$(".code").forEach(c => {
  const b = Object.assign(document.createElement("button"), { className: "copy", textContent: "Copy" });
  b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("pre", c).innerText); b.textContent = "Copied"; } catch { b.textContent = "Press Ctrl+C"; }
    setTimeout(() => b.textContent = "Copy", 1400);
  });
  c.append(b);
  if (c.dataset.lang) c.append(Object.assign(document.createElement("span"), { className: "lang", textContent: c.dataset.lang }));
});

/* ---------- Portal explorer ---------- */
const D = p => DOC + p;
const PORTAL = {
  Home: { scope: "Selected project", color: "var(--blue)", items: [
    { n: "Project overview", w: "Landing page for the selected project with quick actions.", b: ["Copy the <b>project endpoint</b> from the welcome screen: <code>https://&lt;resource&gt;.services.ai.azure.com/api/projects/&lt;project&gt;</code>", "Jump straight into models, agents and docs"], u: ["how-to/create-projects", "Create a project"] },
  ]},
  Discover: { scope: "Selected project", color: "var(--violet)", items: [
    { n: "Model catalog", w: "Browse and deploy models. Filter <b>Collections</b> to <b>Direct from Azure</b> for models sold by Azure, or browse partner and community models.", b: ["Open a model card to see capabilities, <b>Pricing</b>, and <b>Deploy</b> (including <b>Custom settings</b> for deployment type)", "More than 10,000 models from Microsoft, OpenAI, Anthropic, Meta and others"], u: ["concepts/foundry-models-overview", "Foundry Models overview"] },
    { n: "Model benchmarks", w: "Leaderboards and side-by-side comparison to help choose a model.", b: ["Compare models on quality, cost and throughput", "Run benchmark evaluations against your own data"], u: ["concepts/model-benchmarks", "Model leaderboards"] },
  ]},
  Build: { scope: "Selected project", color: "var(--cyan)", groups: true, items: [
    { g: "Create" },
    { n: "Agents", w: "Create and manage prompt, workflow and hosted agents. Each agent has its own tabs.", b: ["<b>Details</b>: active version, endpoint and channels", "<b>Monitor</b>: token usage, latency, run success, evaluation and red-team results <span class='tag prev'>Preview</span>", "<b>Optimize</b>: agent optimizer wizard", "<b>Publish</b>: Teams and Microsoft Copilot, or a stable endpoint"], u: ["agents/overview", "Agent Service overview"] },
    { n: "Models", w: "Your deployments, plus the playgrounds to try them.", b: ["Select a deployed model to open its <b>playground</b>", "Compare outputs, tune parameters, add a system message"], u: ["concepts/concept-playgrounds", "Playgrounds"] },
    { n: "Services", w: "Foundry Tools: Speech, Vision, Language, Content Safety, Content Understanding and others.", b: ["Pre-built AI services you can also expose as agent tools"], u: ["agents/how-to/tools/azure-ai-speech", "Azure Speech tool"] },
    { n: "Tools", w: "The tool catalog and custom tools your agents can call.", b: ["Catalog of connectors and MCP servers (1,000+ connectors)", "<b>Custom &gt; Model Context Protocol</b> for your own MCP server", "Group tools into a <b>Toolbox</b>"], u: ["agents/concepts/toolbox-overview", "Toolbox"] },
    { n: "Knowledge", w: "Foundry IQ knowledge bases and their knowledge sources.", b: ["Create or connect an Azure AI Search service", "Add knowledge sources one at a time; set retrieval behavior"], u: ["agents/concepts/what-is-foundry-iq", "Foundry IQ"] },
    { n: "Memory", w: "Memory stores for long-term agent recall <span class='tag prev'>Preview</span>", b: ["User profile, chat summary and procedural memory", "Default retention (TTL) controls"], u: ["agents/concepts/what-is-memory", "Memory overview"] },
    { n: "Guardrails", w: "Create guardrails (named sets of controls) and apply them to models and agents.", b: ["Four intervention points: user input, tool call, tool response, output", "Assign to one or many deployments and agents"], u: ["guardrails/guardrails-overview", "Guardrails overview"] },
    { n: "Data", w: "Files and datasets used by agents, evaluations and fine-tuning.", b: ["Upload files for file search", "Evaluation datasets, including datasets generated from traces"], u: ["observability/how-to/evaluation-datasets", "Evaluation datasets"] },
    { g: "Optimize" },
    { n: "Evaluations", w: "Create, run and compare evaluations on models and agents.", b: ["Built-in quality, safety, RAG and agent evaluators", "View and analyze results; cluster analysis"], u: ["concepts/evaluation-overview", "Evaluation overview"] },
    { n: "Fine-tune", w: "Customize a model on your own data when prompting and retrieval are not enough.", b: ["Charged for training, hosting (hourly, even if idle) and inference", "Deploy fine-tuned models, then evaluate safety"], u: ["fine-tuning/overview", "Fine-tuning overview"] },
  ]},
  Operate: { scope: "All projects in the subscription", color: "var(--amber)", items: [
    { n: "Overview", w: "Fleet health at a glance: active agents, cost trends, run completion, prevented behaviors.", b: ["Drill into anomalies and cost spikes", "Trend-based health scores and alert summaries"], u: ["control-plane/overview", "Foundry Control Plane"] },
    { n: "Assets", w: "One searchable table of every agent, model and tool across projects.", b: ["Filter by version, tags, health score, cost, alerts, token usage", "Drill into Evaluation or Monitoring; see inline recommendations", "Observe and modify guardrails"], u: ["control-plane/how-to-manage-agents", "Manage agents at scale"] },
    { n: "Compliance", w: "Define, apply and monitor guardrail policies; integrates Azure Policy, Microsoft Defender and Microsoft Purview.", b: ["Versioned policies and assignments", "Surface non-compliant assets and bulk-remediate"], u: ["control-plane/how-to-manage-compliance-security", "Compliance and security"] },
    { n: "Tracing", w: "Inspect traces of agent and model runs (OpenTelemetry, stored in Application Insights).", b: ["Replay traces, annotate with human feedback", "Convert traces into evaluation datasets"], u: ["observability/concepts/trace-agent-concept", "Tracing concepts"] },
  ]},
  Manage: { scope: "Selected project and its parent resource", color: "var(--green)", items: [
    { n: "Quota", w: "Which deployments consume how much quota. Toggle <b>Show all</b> to see available quota and regions before you deploy.", b: ["Request more quota from the quota page"], u: ["how-to/quota", "Manage quotas"] },
    { n: "AI Gateway", w: "Enable Azure API Management as the AI Gateway for the resource; set token limits per project.", b: ["<b>Add AI Gateway</b>, then <b>Token management</b> &gt; <b>+ Set limit</b>", "New projects have the gateway enabled by default; add existing projects manually"], u: ["configuration/enable-ai-api-management-gateway-portal", "Configure AI Gateway"] },
    { n: "Project details", w: "Project configuration plus people and connections.", b: ["<b>Users</b> tab: add or remove access (Foundry roles)", "<b>Connected resources</b> tab: storage, Foundry Tools and others", "Resource ID, endpoint, subscription, location"], u: ["concepts/rbac-foundry", "Role-based access control"] },
    { n: "Resource details", w: "The parent Foundry resource and every project it contains.", b: ["Open the resource in the Azure portal", "<b>Projects</b> tab: add projects to the resource"], u: ["concepts/architecture", "Service architecture"] },
  ]},
  Docs: { scope: "Not project specific", color: "var(--rose)", items: [
    { n: "Documentation", w: "Links to Microsoft Learn documentation, quickstarts and samples.", b: ["Start at the product and capability map to match a goal to a starting point"], u: ["concepts/capabilities", "Capability map"] },
  ]},
};
(function portalExplorer() {
  const host = $("#portalExplorer"); if (!host) return;
  const bar = $(".p-bar", host), left = $(".p-left", host), main = $(".p-main", host);
  let topKey = "Build", itemIdx = 1;
  function drawTop() {
    $$(".p-tab", bar).forEach(b => b.setAttribute("aria-selected", String(b.dataset.k === topKey)));
    host.style.setProperty("--accent", PORTAL[topKey].color);
  }
  function drawLeft() {
    const t = PORTAL[topKey];
    left.replaceChildren(Object.assign(document.createElement("div"), { className: "scope", textContent: "Scope: " + t.scope }));
    t.items.forEach((it, i) => {
      if (it.g) { left.append(Object.assign(document.createElement("div"), { className: "grp", textContent: it.g })); return; }
      const b = Object.assign(document.createElement("button"), { className: "p-item", textContent: it.n });
      b.setAttribute("aria-selected", String(i === itemIdx));
      b.addEventListener("click", () => { itemIdx = i; drawLeft(); drawMain(); });
      left.append(b);
    });
  }
  function drawMain() {
    const it = PORTAL[topKey].items[itemIdx];
    main.innerHTML = `<h3>${topKey} › ${it.n}</h3><p class="what">${it.w}</p><ul>${it.b.map(x => `<li>${x}</li>`).join("")}</ul>
      <div class="meta"><span class="chip">${PORTAL[topKey].scope}</span><a class="ref" href="${D(it.u[0])}" target="_blank" rel="noopener">${it.u[1]}</a></div>`;
  }
  Object.keys(PORTAL).forEach(k => {
    const b = Object.assign(document.createElement("button"), { className: "p-tab", textContent: k });
    b.dataset.k = k; b.setAttribute("role", "tab");
    b.addEventListener("click", () => { topKey = k; itemIdx = PORTAL[k].items.findIndex(i => !i.g); drawTop(); drawLeft(); drawMain(); });
    bar.insertBefore(b, $(".p-toggle", bar));
  });
  drawTop(); drawLeft(); drawMain();
})();

/* ---------- Deployment type chooser ---------- */
const DEPLOY = [
  { q: "General workloads, newest models, lowest price", t: "Global Standard", sku: "GlobalStandard", bill: "Pay per token", res: "Processed in any Azure region", note: "The documented default starting point: launches first for new models, lowest price, broadest region coverage.", p: "foundry-models/concepts/deployment-types" },
  { q: "Processing must stay in the US, EU or APAC data zone", t: "Data Zone Standard (or Data Zone Provisioned)", sku: "DataZoneStandard / DataZoneProvisionedManaged", bill: "Pay per token, or reserved PTU", res: "Processed only within the data zone", note: "Choose the provisioned variant when you also need predictable throughput.", p: "foundry-models/concepts/deployment-types" },
  { q: "Processing must stay inside one Azure geography", t: "Standard (or Regional Provisioned)", sku: "Standard / ProvisionedManaged", bill: "Pay per token, or reserved PTU", res: "Within the customer-specified geography", note: "Geography-based types arrive last and have no guaranteed availability date.", p: "foundry-models/concepts/deployment-types" },
  { q: "Steady, high traffic that needs guaranteed throughput and consistent latency", t: "Provisioned throughput (PTU)", sku: "GlobalProvisionedManaged / DataZoneProvisionedManaged / ProvisionedManaged", bill: "Per PTU per hour, or Azure Reservations", res: "Global, data zone or regional (your choice)", note: "Size with the capacity calculator, buy reservations for production, and add spillover to a standard deployment for bursts.", p: "openai/concepts/provisioned-throughput" },
  { q: "Latency-sensitive production traffic, but no long-term commitment", t: "Priority processing", sku: "Priority processing", bill: "Pay per token at the priority rate", res: "Per the deployment you choose", note: "Defined latency target per model without reserving capacity.", p: "openai/concepts/priority-processing" },
  { q: "Large asynchronous jobs, results within a day", t: "Global Batch or Data Zone Batch", sku: "GlobalBatch / DataZoneBatch", bill: "50% discount, 24-hour turnaround", res: "Global or within the data zone", note: "No latency SLA; results are returned asynchronously.", p: "openai/how-to/batch" },
  { q: "Delay-tolerant work where I want discounted token rates", t: "Flex processing", sku: "Flex", bill: "Discounted token rates with dedicated meters", res: "Per deployment", note: "Marked preview in the docs.", p: "openai/how-to/flex-processing", prev: true },
  { q: "Just evaluating a fine-tuned model", t: "Developer tier", sku: "DeveloperTier", bill: "Pay per token", res: "Any Azure region", note: "Evaluation only: 24-hour lifetime, no SLA and no data-residency guarantee.", p: "foundry-models/concepts/deployment-types" },
  { q: "Just trying a model right now, no deployment", t: "Instant access", sku: "n/a (no deployment)", bill: "Per the model's meters", res: "West US 3 during preview", note: "Call a supported model by name with your normal SDK. Support list changes frequently.", p: "concepts/instant-models", prev: true },
];
(function chooser() {
  const host = $("#deployChooser"); if (!host) return;
  const list = $(".choice", host), out = $(".result", host);
  function show(i) {
    $$("button", list).forEach((b, j) => b.classList.toggle("on", i === j));
    const d = DEPLOY[i];
    out.innerHTML = `<b class="big">${d.t}${d.prev ? ' <span class="tag prev">Preview</span>' : ""}</b>
      <dl class="kv"><dt>SKU code</dt><dd><code>${d.sku}</code></dd><dt>Billing</dt><dd>${d.bill}</dd><dt>Data processing</dt><dd>${d.res}</dd><dt>Why</dt><dd>${d.note}</dd></dl>
      <div class="refs"><span>Docs</span><a class="ref" href="${D(d.p)}" target="_blank" rel="noopener">Read more</a></div>`;
  }
  DEPLOY.forEach((d, i) => { const b = Object.assign(document.createElement("button"), { textContent: d.q }); b.addEventListener("click", () => show(i)); list.append(b); });
  show(0);
})();

/* ---------- Token cost estimator ---------- */
(function tokenCalc() {
  const host = $("#tokenCalc"); if (!host) return;
  const g = id => parseFloat($("#" + id, host).value) || 0;
  function run() {
    const reqs = g("tc-req") * 30, inT = g("tc-in"), outT = g("tc-out"), cache = Math.min(100, g("tc-cache")) / 100;
    const rIn = g("tc-rin"), rC = g("tc-rc"), rOut = g("tc-rout");
    const cost = (c, o) => (reqs * inT * (1 - c) / 1e6) * rIn + (reqs * inT * c / 1e6) * rC + (reqs * outT * o / 1e6) * rOut;
    const base = cost(cache, 1);
    const pIn = (reqs * inT * (1 - cache) / 1e6) * rIn, pC = (reqs * inT * cache / 1e6) * rC, pO = (reqs * outT / 1e6) * rOut;
    const tot = pIn + pC + pO || 1;
    $("#tc-total", host).textContent = "$" + fmt(base, 2);
    $("#tc-tokens", host).textContent = fmt((reqs * (inT + outT)) / 1e6, 1) + " M";
    $("#tc-bar-in", host).style.width = (pIn / tot * 100) + "%";
    $("#tc-bar-c", host).style.width = (pC / tot * 100) + "%";
    $("#tc-bar-out", host).style.width = (pO / tot * 100) + "%";
    $("#tc-w1", host).textContent = "-$" + fmt(base - cost(Math.min(1, cache + 0.2), 1), 2);
    $("#tc-w2", host).textContent = "-$" + fmt(base - cost(cache, 0.8), 2);
  }
  $$("input", host).forEach(i => i.addEventListener("input", run)); run();
})();

/* ---------- CCU forecast ---------- */
(function ccuCalc() {
  const host = $("#ccuCalc"); if (!host) return;
  const g = id => parseFloat($("#" + id, host).value) || 0;
  function run() {
    const mIn = g("cc-in"), mCr = g("cc-cr"), mOut = g("cc-out");
    const rIn = g("cc-rin"), rCr = g("cc-rcr"), rOut = g("cc-rout"), disc = Math.min(100, g("cc-disc")) / 100, price = g("cc-price");
    const shift = g("cc-shift") / 100, trim = g("cc-trim") / 100;
    const usd = (i, c, o) => (i * rIn + c * rCr + o * rOut) * (1 - disc);
    const ccu = d => price > 0 ? d / price : 0;
    const base = usd(mIn, mCr, mOut);
    const moved = mIn * shift;
    const opt = usd(mIn - moved, mCr + moved, mOut * (1 - trim));
    $("#cc-shift-v", host).textContent = Math.round(shift * 100) + "%";
    $("#cc-trim-v", host).textContent = Math.round(trim * 100) + "%";
    $("#cc-base", host).textContent = fmt(ccu(base), 1);
    $("#cc-opt", host).textContent = fmt(ccu(opt), 1);
    $("#cc-save", host).textContent = fmt(ccu(base - opt), 1) + " CCU (" + (base ? fmt((base - opt) / base * 100, 1) : "0") + "%)";
    $("#cc-usd", host).textContent = "$" + fmt(base, 2) + " → $" + fmt(opt, 2);
  }
  $$("input", host).forEach(i => i.addEventListener("input", run)); run();
})();

/* ---------- Hosted agent session lifecycle ---------- */
(function sessionStates() {
  const host = $("#sessionStates"); if (!host) return;
  const st = $$(".state", host); let i = 0, timer;
  const set = n => { i = n; st.forEach((s, j) => s.classList.toggle("on", j === n)); };
  st.forEach((s, j) => s.addEventListener("click", () => { set(j); restart(); }));
  function restart() { clearInterval(timer); if (root.getAttribute("data-motion") === "on") timer = setInterval(() => set((i + 1) % st.length), 3200); }
  new MutationObserver(restart).observe(root, { attributes: true, attributeFilter: ["data-motion"] });
  set(0); restart();
})();
