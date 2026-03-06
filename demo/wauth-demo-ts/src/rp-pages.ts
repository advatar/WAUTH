function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface MockRpPage {
  slug: "bank" | "hr" | "tax-office";
  title: string;
  eyebrow: string;
  summary: string;
  audience: string;
  actionProfile: string;
  assurance: string;
  protectedAction: string;
  whyLocked: string;
  primaryColor: string;
  secondaryColor: string;
  details: string[];
}

const MOCK_RP_PAGES: MockRpPage[] = [
  {
    slug: "bank",
    title: "NorthRiver Bank Statement Vault",
    eyebrow: "Mock Bank RP",
    summary: "A customer-facing statement portal that refuses silent agent access until WAUTH issues a read-scoped capability.",
    audience: "https://bank.demo.local/api/statement",
    actionProfile: "aaif.wauth.action.bank.read_statement/v0.1",
    assurance: "AAIF-PoHP-1 equivalent for read-only evidence collection",
    protectedAction: "Read one monthly statement for tax preparation.",
    whyLocked: "Even read-only financial evidence is sensitive, so the portal requires a short-lived capability plus sender-constrained retry.",
    primaryColor: "#0f5d46",
    secondaryColor: "#d9f6ea",
    details: [
      "Human-readable summary: retrieve the January 2026 bank statement for account 123.",
      "WAUTH scope: one statement endpoint, one action hash, one DPoP-bound caller.",
      "Demo role in the story: first evidence source the tax assistant needs."
    ]
  },
  {
    slug: "hr",
    title: "Juniper HR Income Records",
    eyebrow: "Mock HR System RP",
    summary: "An employer records portal that releases income data only after the wallet flow proves the request is bounded to the declared tax task.",
    audience: "https://employer.demo.local/api/income",
    actionProfile: "aaif.wauth.action.employer.read_income/v0.1",
    assurance: "AAIF-PoHP-1 equivalent for payroll evidence lookup",
    protectedAction: "Read one tax-year income statement for employee EMP-001.",
    whyLocked: "Payroll systems should not trust an agent just because it is logged in somewhere else; they need exact-action authorization.",
    primaryColor: "#7a4d12",
    secondaryColor: "#fff0cf",
    details: [
      "Human-readable summary: retrieve the 2025 income statement needed to prepare the filing.",
      "WAUTH scope: one HR records endpoint with a replay-resistant capability.",
      "Demo role in the story: second evidence source before the return can be assembled."
    ]
  },
  {
    slug: "tax-office",
    title: "Civic Revenue Filing Gateway",
    eyebrow: "Mock Tax Office RP",
    summary: "A filing gateway that accepts the final submission only after stronger human presence is proven and the submission action hash matches exactly.",
    audience: "https://irs.demo.local/api/submit",
    actionProfile: "aaif.wauth.action.irs.submit_return/v0.1",
    assurance: "AAIF-PoHP-2 equivalent step-up for final submission",
    protectedAction: "Submit the prepared 2025 tax return once.",
    whyLocked: "Final filing has legal effect, so the tax office demands a stronger step-up than the earlier evidence reads.",
    primaryColor: "#123b7a",
    secondaryColor: "#dce9ff",
    details: [
      "Human-readable summary: submit filing FILING-2025-0001 for the prepared return bundle.",
      "WAUTH scope: exact-action binding to the final submit call plus DPoP sender constraint.",
      "Demo role in the story: the high-consequence RP that proves WAUTH is more than a read-only convenience."
    ]
  }
];

function cardList(items: string[]): string {
  return items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function mockRpPageHref(slug: MockRpPage["slug"], requestPath: string): string {
  const apiPrefix = requestPath.startsWith("/api") ? "/api" : "";
  return `${apiPrefix}/${slug}`;
}

function mockRpDirectoryHref(requestPath: string): string {
  return requestPath.startsWith("/api") ? "/api" : "/";
}

export function renderMockRpDirectoryPage(requestPath: string): string {
  const cards = MOCK_RP_PAGES
    .map((page) => {
      return `<a class="rp-card" href="${mockRpPageHref(page.slug, requestPath)}">
  <span class="eyebrow">${escapeHtml(page.eyebrow)}</span>
  <h2>${escapeHtml(page.title)}</h2>
  <p>${escapeHtml(page.summary)}</p>
  <div class="meta">Protected audience: <code>${escapeHtml(page.audience)}</code></div>
</a>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WAUTH Mock Relying Parties</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #14243a;
      --muted: #54657f;
      --paper: #fffdf8;
      --panel: rgba(255, 255, 255, 0.82);
      --stroke: rgba(20, 36, 58, 0.12);
      --shadow: 0 24px 60px rgba(23, 34, 58, 0.14);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, #ffe4b7 0%, rgba(255, 228, 183, 0) 28%),
        radial-gradient(circle at top right, #d7ebff 0%, rgba(215, 235, 255, 0) 30%),
        linear-gradient(180deg, #f7f1e4 0%, #eef4fb 100%);
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
      padding: 32px 20px 56px;
    }
    .shell {
      width: min(1120px, 100%);
      margin: 0 auto;
      background: var(--panel);
      backdrop-filter: blur(18px);
      border: 1px solid var(--stroke);
      border-radius: 28px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .hero {
      padding: 40px 28px 28px;
      border-bottom: 1px solid var(--stroke);
    }
    .eyebrow {
      display: inline-block;
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
    }
    h1 {
      margin: 0;
      font-size: clamp(2.2rem, 5vw, 4rem);
      line-height: 0.95;
      letter-spacing: -0.04em;
    }
    .lede {
      margin: 18px 0 0;
      max-width: 760px;
      color: var(--muted);
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      font-size: 1.05rem;
      line-height: 1.6;
    }
    .grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      padding: 28px;
    }
    .rp-card {
      text-decoration: none;
      color: inherit;
      border: 1px solid var(--stroke);
      border-radius: 22px;
      padding: 22px;
      background: rgba(255, 255, 255, 0.8);
      transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
      box-shadow: 0 10px 24px rgba(20, 36, 58, 0.06);
    }
    .rp-card:hover {
      transform: translateY(-3px);
      border-color: rgba(20, 36, 58, 0.24);
      box-shadow: 0 18px 34px rgba(20, 36, 58, 0.10);
    }
    h2 {
      margin: 0 0 10px;
      font-size: 1.5rem;
      line-height: 1.1;
    }
    p {
      margin: 0 0 12px;
      color: var(--muted);
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    .meta {
      color: var(--ink);
      font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
      font-size: 0.8rem;
      line-height: 1.5;
    }
    code {
      font-family: inherit;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <span class="eyebrow">WAUTH Demo Directory</span>
      <h1>Mock relying parties with readable front doors.</h1>
      <p class="lede">These pages make the demo easier to explain live: each surface tells the human story, the protected action, and why WAUTH blocks the agent until the wallet issues a bounded capability.</p>
    </section>
    <section class="grid">
      ${cards}
    </section>
  </main>
</body>
</html>`;
}

export function renderMockRpLandingPage(page: MockRpPage, requestPath: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #112134;
      --muted: #566579;
      --primary: ${escapeHtml(page.primaryColor)};
      --secondary: ${escapeHtml(page.secondaryColor)};
      --surface: rgba(255, 255, 255, 0.86);
      --stroke: rgba(17, 33, 52, 0.14);
      --shadow: 0 26px 72px rgba(17, 33, 52, 0.16);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 14%, var(--secondary) 0%, rgba(255,255,255,0) 34%),
        linear-gradient(135deg, rgba(17, 33, 52, 0.08), rgba(17, 33, 52, 0)),
        #f4f7fb;
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
      padding: 28px 18px 44px;
    }
    .shell {
      width: min(1080px, 100%);
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--stroke);
      border-radius: 28px;
      box-shadow: var(--shadow);
      overflow: hidden;
      backdrop-filter: blur(18px);
    }
    .hero {
      position: relative;
      padding: 34px 28px 28px;
      background: linear-gradient(135deg, rgba(255,255,255,0.65), rgba(255,255,255,0.2));
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: auto 24px 20px auto;
      width: 140px;
      height: 140px;
      background: radial-gradient(circle, var(--secondary) 0%, rgba(255,255,255,0) 70%);
      pointer-events: none;
    }
    .eyebrow {
      display: inline-block;
      margin-bottom: 12px;
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 12px;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      font-weight: 700;
    }
    h1 {
      margin: 0;
      max-width: 720px;
      font-size: clamp(2.2rem, 5vw, 4.2rem);
      line-height: 0.94;
      letter-spacing: -0.045em;
    }
    .summary {
      margin: 18px 0 0;
      max-width: 760px;
      color: var(--muted);
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      font-size: 1.05rem;
      line-height: 1.62;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      padding: 22px 24px 26px;
    }
    .meta-card, .detail-card {
      border: 1px solid var(--stroke);
      border-radius: 22px;
      padding: 18px;
      background: rgba(255,255,255,0.72);
    }
    h2 {
      margin: 0 0 10px;
      font-size: 1.2rem;
      line-height: 1.15;
    }
    p, li {
      margin: 0;
      color: var(--muted);
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    ul {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 10px;
    }
    .label {
      display: block;
      margin-bottom: 8px;
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: 0.16em;
      font-size: 11px;
      font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
    }
    .mono {
      color: var(--ink);
      font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
      font-size: 0.86rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 24px 24px;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: var(--muted);
    }
    .back {
      text-decoration: none;
      color: var(--primary);
      font-weight: 600;
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel">
      <div class="hero">
        <span class="eyebrow">${escapeHtml(page.eyebrow)}</span>
        <h1>${escapeHtml(page.title)}</h1>
        <p class="summary">${escapeHtml(page.summary)}</p>
      </div>
      <div class="meta-grid">
        <article class="meta-card">
          <span class="label">Protected Action</span>
          <p>${escapeHtml(page.protectedAction)}</p>
        </article>
        <article class="meta-card">
          <span class="label">Assurance</span>
          <p>${escapeHtml(page.assurance)}</p>
        </article>
        <article class="meta-card">
          <span class="label">Audience URI</span>
          <div class="mono">${escapeHtml(page.audience)}</div>
        </article>
        <article class="meta-card">
          <span class="label">Action Profile</span>
          <div class="mono">${escapeHtml(page.actionProfile)}</div>
        </article>
        <article class="detail-card" style="grid-column: 1 / -1;">
          <span class="label">Why This RP Blocks</span>
          <p>${escapeHtml(page.whyLocked)}</p>
        </article>
        <article class="detail-card" style="grid-column: 1 / -1;">
          <span class="label">Demo Notes</span>
          <ul>${cardList(page.details)}</ul>
        </article>
      </div>
      <div class="footer">
        <span>Mock landing page only. The protected RP behavior still runs inside the WAUTH demo flow.</span>
        <a class="back" href="${mockRpDirectoryHref(requestPath)}">Back to RP Directory</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

export function findMockRpPage(pathname: string): MockRpPage | undefined {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  switch (normalized) {
    case "/bank":
    case "/api/bank":
      return MOCK_RP_PAGES[0];
    case "/hr":
    case "/employer":
    case "/api/hr":
    case "/api/employer":
      return MOCK_RP_PAGES[1];
    case "/tax-office":
    case "/irs":
    case "/api/tax-office":
    case "/api/irs":
      return MOCK_RP_PAGES[2];
    default:
      return undefined;
  }
}

export function isMockRpDirectoryPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/" || normalized === "/api";
}
