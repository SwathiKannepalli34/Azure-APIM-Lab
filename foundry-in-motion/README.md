# Foundry in Motion
### An animated, source-linked guide to Microsoft Foundry, from your first project to a governed fleet of AI agents

**Open the guide:** https://swathikannepalli34.github.io/Azure-Learning-by-SK/foundry-in-motion/

**Foundry in Motion** is an interactive guide that replaces a long slide deck. It walks through the whole Microsoft Foundry journey in one scrollable page, with animated diagrams and a link to the official Microsoft Learn page for each topic. It is domain-neutral, so you can use it with any customer.

## What it covers

| Stage | Topics |
|---|---|
| **Foundations** | What Foundry is, a tab-by-tab tour of the portal, and creating a project (portal, SDK, access roles, bring-your-own resources) |
| **Models** | The model catalog, deployment types, model router, and frontier model access (OpenAI, Claude, partner and Microsoft models) |
| **Agents** | Prompt agents, RAG agents, Foundry IQ, Memory, the agent optimizer, the toolbox and connectors, and publishing to Microsoft Copilot and Teams |
| **Hosted agents** | Architecture, compute sizes, runtime and session lifecycle, protocols, identity, and deployment |
| **Cost** | Deployment options, tokens, provisioned throughput (PTUs), and Claude Consumption Units (CCUs) with ways to optimize them |
| **Trust and operate** | Tracing and monitoring, evaluations and AI red teaming, and guardrails at four intervention points |
| **Govern** | Identity, policy, compliance, the Foundry Control Plane, and the AI Gateway (API Management tiers, token limits, policies) |

## Built to present

- **Visuals specific to Foundry.** Animated diagrams show the hosted agent architecture, agentic retrieval, the memory loop and the optimizer loop.
- **Interactive tools.** Click through a replica of the portal, pick a deployment type, estimate monthly token cost, and forecast CCUs with what-if sliders.
- **Presenter controls.** A motion on/off switch (saved in the browser, and off by default when the operating system asks for reduced motion), light and dark themes, an Expand all button, and a layout that works on phones.
- **Grounded in official documentation.** Each section ends with links to Microsoft Learn (`learn.microsoft.com/azure/foundry`). All 155 links were checked and returned 200 when the guide was published. Preview features are tagged.

## Using it with customers

- **No setup.** It is one HTML file (`dist/foundry-in-motion.html`) that works in any modern browser.
- **Easy to tailor.** Content lives in short section files. Edit one and rebuild with a single command.
- **Safe to share.** The published page contains public documentation content only, with no customer or tenant data.

The cost calculators use placeholder rates that you replace with current pricing. Foundry changes quickly, so re-run the link check and re-read the linked pages before each customer session.

## Edit and rebuild

```powershell
python build.py            # rebuild dist/foundry-in-motion.html
python build.py --check    # also verify every learn.microsoft.com link returns 200
```

- Content lives in `src/sections/NN-*.html`. Add docs links with `{{doc:path|Label}}` (resolves to `https://learn.microsoft.com/en-us/azure/foundry/<path>`) or `{{url:https://...|Label}}`.
- Styles are in `src/styles.css` and behavior is in `src/app.js`.
- Optional UI smoke test: `pip install playwright`, then `python smoke_test.py` (uses Microsoft Edge in headless mode).

## Grounding

Facts come from Microsoft Learn pages read in October 2026. Items marked Preview change often, so re-run the link check and re-read the linked page before each customer session.
