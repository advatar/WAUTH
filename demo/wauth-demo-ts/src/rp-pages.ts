function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface MockRpSignal {
  label: string;
  value: string;
}

interface MockRpActivity {
  title: string;
  meta: string;
  status: string;
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
  operatingState: string;
  primaryActionLabel: string;
  primaryActionHint: string;
  secondaryActionLabel: string;
  signals: MockRpSignal[];
  activitiesHeading: string;
  activities: MockRpActivity[];
  controlNotes: string[];
}

const MOCK_RP_PAGES: MockRpPage[] = [
  {
    slug: "bank",
    title: "NorthRiver Bank Statement Vault",
    eyebrow: "NorthRiver Retail Banking",
    summary: "A customer-facing evidence workspace that looks like a real statement portal but blocks silent export until the wallet retries with a bounded read capability.",
    audience: "https://bank.demo.local/api/statement",
    actionProfile: "aaif.wauth.action.bank.read_statement/v0.1",
    assurance: "AAIF-PoHP-1 equivalent for read-only financial evidence",
    protectedAction: "Download the January 2026 statement PDF for checking account 1234.",
    whyLocked: "Financial evidence is sensitive enough that the portal refuses background export unless the caller proves exact-action authorization and sender possession.",
    primaryColor: "#0f5d46",
    secondaryColor: "#d9f6ea",
    operatingState: "Export paused pending wallet authorization",
    primaryActionLabel: "Download statement PDF",
    primaryActionHint: "This action stays disabled until WAUTH approval completes.",
    secondaryActionLabel: "View account summary",
    signals: [
      { label: "Customer", value: "Johansson Household" },
      { label: "Requested asset", value: "January 2026 monthly statement" },
      { label: "Policy tier", value: "Read-only evidence with DPoP binding" }
    ],
    activitiesHeading: "Available documents",
    activities: [
      {
        title: "Jan 2026 checking statement",
        meta: "Account ending 1234 · PDF · 1.8 MB",
        status: "Pending wallet approval"
      },
      {
        title: "Year-to-date balance snapshot",
        meta: "Generated March 10, 2026 · Read-only view",
        status: "Ready after verified retry"
      },
      {
        title: "Tax-prep export bundle",
        meta: "Includes statement hash and export receipt",
        status: "Requires step-up"
      }
    ],
    controlNotes: [
      "The retry must be bound to one statement export action, not the whole portal.",
      "The DPoP proof must match the caller that presents the capability token.",
      "Replay protection keeps a copied retry from being reused for later exports."
    ]
  },
  {
    slug: "hr",
    title: "Juniper HR Income Records",
    eyebrow: "Juniper Workforce Portal",
    summary: "A payroll records experience that feels like a real employee admin surface while withholding tax-year evidence until the wallet proves the request is bounded to payroll retrieval.",
    audience: "https://employer.demo.local/api/income",
    actionProfile: "aaif.wauth.action.employer.read_income/v0.1",
    assurance: "AAIF-PoHP-1 equivalent for payroll evidence lookup",
    protectedAction: "Open the 2025 income statement for employee EMP-001.",
    whyLocked: "Employer systems should not treat generic logged-in access as consent for agent retrieval, so this screen demands exact-action authorization before releasing payroll evidence.",
    primaryColor: "#7a4d12",
    secondaryColor: "#fff0cf",
    operatingState: "Payroll statement withheld until wallet approval",
    primaryActionLabel: "Open 2025 income statement",
    primaryActionHint: "The requested statement becomes available only after the bounded WAUTH retry.",
    secondaryActionLabel: "Inspect employee profile",
    signals: [
      { label: "Employee", value: "EMP-001 · Johan Sellstrom" },
      { label: "Requested record", value: "2025 annual income statement" },
      { label: "Policy tier", value: "Payroll evidence with replay-resistant retry" }
    ],
    activitiesHeading: "Records queue",
    activities: [
      {
        title: "2025 annual payroll summary",
        meta: "Tax-year closeout · employer-issued",
        status: "Pending wallet approval"
      },
      {
        title: "Benefit contribution statement",
        meta: "Supplementary evidence for filing support",
        status: "Viewable after authorization"
      },
      {
        title: "Document access log",
        meta: "Shows who opened payroll evidence and when",
        status: "Updated automatically"
      }
    ],
    controlNotes: [
      "The retry is scoped to payroll evidence for one declared tax task.",
      "The action hash ties the capability to the exact record lookup the assistant requested.",
      "A reused token or mismatched DPoP proof is rejected before data leaves the portal."
    ]
  },
  {
    slug: "tax-office",
    title: "Civic Revenue Filing Gateway",
    eyebrow: "Civic Revenue Digital Filing",
    summary: "A public filing gateway that looks like a final submission console and only accepts the prepared return after stronger human presence is proven for the exact filing action.",
    audience: "https://irs.demo.local/api/submit",
    actionProfile: "aaif.wauth.action.irs.submit_return/v0.1",
    assurance: "AAIF-PoHP-2 equivalent step-up for final submission",
    protectedAction: "Submit filing FILING-2025-0001 for the prepared 2025 return bundle.",
    whyLocked: "Final filing has legal effect, so the gateway requires stronger proof than evidence collection and rejects any retry that is not tied to this exact submission.",
    primaryColor: "#123b7a",
    secondaryColor: "#dce9ff",
    operatingState: "Submission blocked until stronger human presence is verified",
    primaryActionLabel: "Submit tax return",
    primaryActionHint: "Final filing stays locked until the approval flow proves step-up requirements.",
    secondaryActionLabel: "Review filing package",
    signals: [
      { label: "Filing", value: "FILING-2025-0001" },
      { label: "Requested action", value: "Single final submission to revenue gateway" },
      { label: "Policy tier", value: "PoHP-2 equivalent with exact-action binding" }
    ],
    activitiesHeading: "Submission checklist",
    activities: [
      {
        title: "Prepared 2025 return bundle",
        meta: "Ready for final submission · checksum sealed",
        status: "Pending wallet approval"
      },
      {
        title: "Identity assurance checkpoint",
        meta: "Higher consequence action requires stronger proof",
        status: "Step-up required"
      },
      {
        title: "Submission receipt placeholder",
        meta: "Receipt issued only after accepted retry",
        status: "Waiting for signed action"
      }
    ],
    controlNotes: [
      "The submission retry must match the return bundle action hash exactly.",
      "The gateway raises the human-presence bar above the earlier evidence reads.",
      "A successful retry returns a filing receipt only once; replayed submissions are rejected."
    ]
  }
];

function cardList(items: string[]): string {
  return items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function renderSignalCards(items: MockRpSignal[]): string {
  return items
    .map((item) => `<article class="signal-card">
  <span class="signal-label">${escapeHtml(item.label)}</span>
  <strong>${escapeHtml(item.value)}</strong>
</article>`)
    .join("\n");
}

function renderActivityRows(items: MockRpActivity[]): string {
  return items
    .map((item) => `<div class="activity-row">
  <div class="activity-copy">
    <strong>${escapeHtml(item.title)}</strong>
    <span>${escapeHtml(item.meta)}</span>
  </div>
  <span class="status-pill">${escapeHtml(item.status)}</span>
</div>`)
    .join("\n");
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
  <span class="card-tag">${escapeHtml(page.eyebrow)}</span>
  <h2>${escapeHtml(page.title)}</h2>
  <p>${escapeHtml(page.summary)}</p>
  <div class="card-meta">
    <span>${escapeHtml(page.operatingState)}</span>
    <code>${escapeHtml(page.audience)}</code>
  </div>
</a>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Service Access Directory</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #18263b;
      --muted: #5b6980;
      --paper: #f5efe4;
      --panel: rgba(255, 252, 246, 0.8);
      --stroke: rgba(24, 38, 59, 0.12);
      --shadow: 0 28px 72px rgba(24, 38, 59, 0.14);
      --accent: #9e5b17;
      --accent-soft: #ffe2be;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, #f7ddb8 0%, rgba(247, 221, 184, 0) 30%),
        radial-gradient(circle at 88% 10%, #d6ebff 0%, rgba(214, 235, 255, 0) 28%),
        linear-gradient(180deg, #f7f1e4 0%, #ebf2fb 100%);
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
      padding: 34px 18px 56px;
    }
    .shell {
      width: min(1180px, 100%);
      margin: 0 auto;
      border: 1px solid var(--stroke);
      border-radius: 30px;
      overflow: hidden;
      background: var(--panel);
      backdrop-filter: blur(18px);
      box-shadow: var(--shadow);
    }
    .masthead {
      display: grid;
      gap: 18px;
      padding: 34px 28px 26px;
      border-bottom: 1px solid var(--stroke);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.78);
      color: var(--accent);
      font: 700 11px/1.1 "IBM Plex Mono", "SFMono-Regular", monospace;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      max-width: 820px;
      font-size: clamp(2.6rem, 5vw, 4.6rem);
      line-height: 0.93;
      letter-spacing: -0.045em;
    }
    .lede {
      margin: 0;
      max-width: 820px;
      color: var(--muted);
      font: 500 1.05rem/1.7 "Avenir Next", "Segoe UI", sans-serif;
    }
    .stats {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .stat {
      padding: 16px 18px;
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.72);
      border: 1px solid var(--stroke);
    }
    .stat .label {
      display: block;
      margin-bottom: 8px;
      color: var(--muted);
      font: 700 11px/1 "IBM Plex Mono", "SFMono-Regular", monospace;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .stat strong {
      display: block;
      font-size: 1.02rem;
    }
    .grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      padding: 26px;
    }
    .rp-card {
      display: grid;
      gap: 14px;
      text-decoration: none;
      color: inherit;
      border-radius: 24px;
      padding: 24px;
      background: rgba(255, 255, 255, 0.78);
      border: 1px solid var(--stroke);
      box-shadow: 0 14px 30px rgba(24, 38, 59, 0.08);
      transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
    }
    .rp-card:hover {
      transform: translateY(-4px);
      border-color: rgba(24, 38, 59, 0.24);
      box-shadow: 0 22px 40px rgba(24, 38, 59, 0.12);
    }
    .card-tag {
      color: var(--accent);
      font: 700 11px/1.1 "IBM Plex Mono", "SFMono-Regular", monospace;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    h2 {
      margin: 0;
      font-size: 1.6rem;
      line-height: 1.08;
    }
    p {
      margin: 0;
      color: var(--muted);
      font: 500 0.98rem/1.65 "Avenir Next", "Segoe UI", sans-serif;
    }
    .card-meta {
      display: grid;
      gap: 8px;
      margin-top: auto;
      color: var(--ink);
      font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
      font-size: 0.8rem;
      line-height: 1.55;
    }
    code {
      font-family: inherit;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="masthead">
      <span class="eyebrow">Partner Service Access</span>
      <h1>Choose a secure service portal.</h1>
      <p class="lede">Banking, payroll, and filing services are available through dedicated portals. Sensitive actions stay paused until the active session meets the required verification policy for that product surface.</p>
      <div class="stats">
        <article class="stat">
          <span class="label">Portal Types</span>
          <strong>Retail banking, HR records, and tax filing</strong>
        </article>
        <article class="stat">
          <span class="label">Session Model</span>
          <strong>Signed-in customer views with gated actions</strong>
        </article>
        <article class="stat">
          <span class="label">Access Control</span>
          <strong>Policy-based verification before protected actions run</strong>
        </article>
      </div>
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
      --muted: #5a677a;
      --primary: ${escapeHtml(page.primaryColor)};
      --secondary: ${escapeHtml(page.secondaryColor)};
      --surface: rgba(255, 255, 255, 0.84);
      --panel: rgba(255, 255, 255, 0.72);
      --stroke: rgba(17, 33, 52, 0.12);
      --shadow: 0 28px 80px rgba(17, 33, 52, 0.14);
      --danger: #8b2f2f;
      --danger-soft: rgba(139, 47, 47, 0.1);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 12%, var(--secondary) 0%, rgba(255,255,255,0) 34%),
        linear-gradient(135deg, rgba(17, 33, 52, 0.1), rgba(17, 33, 52, 0)),
        #f4f7fb;
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
      padding: 26px 16px 40px;
    }
    .shell {
      width: min(1180px, 100%);
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }
    .panel {
      border-radius: 30px;
      border: 1px solid var(--stroke);
      background: var(--surface);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
      overflow: hidden;
    }
    .topbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 24px;
      border-bottom: 1px solid var(--stroke);
      background: rgba(255, 255, 255, 0.6);
      font-family: "Avenir Next", "Segoe UI", sans-serif;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-mark {
      width: 38px;
      height: 38px;
      border-radius: 14px;
      background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 45%, white));
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25);
    }
    .brand-copy {
      display: grid;
      gap: 3px;
    }
    .brand-copy strong {
      font-size: 1rem;
      line-height: 1.1;
    }
    .brand-copy span,
    .topbar-note {
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.4;
    }
    .hero {
      display: grid;
      gap: 22px;
      padding: 32px 24px 26px;
    }
    .eyebrow {
      display: inline-flex;
      width: fit-content;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 999px;
      color: var(--primary);
      background: rgba(255,255,255,0.72);
      font: 700 11px/1 "IBM Plex Mono", "SFMono-Regular", monospace;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      max-width: 760px;
      font-size: clamp(2.5rem, 5vw, 4.6rem);
      line-height: 0.93;
      letter-spacing: -0.045em;
    }
    .summary {
      margin: 0;
      max-width: 760px;
      color: var(--muted);
      font: 500 1.04rem/1.7 "Avenir Next", "Segoe UI", sans-serif;
    }
    .signal-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    }
    .signal-card {
      padding: 16px 18px;
      border-radius: 22px;
      border: 1px solid var(--stroke);
      background: rgba(255,255,255,0.7);
    }
    .signal-label,
    .section-label {
      display: block;
      margin-bottom: 8px;
      color: var(--muted);
      font: 700 11px/1 "IBM Plex Mono", "SFMono-Regular", monospace;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .signal-card strong {
      display: block;
      font-size: 1rem;
      line-height: 1.35;
    }
    .workspace {
      display: grid;
      gap: 18px;
      grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.9fr);
      padding: 0 24px 24px;
    }
    .workspace-card {
      padding: 22px;
      border-radius: 26px;
      border: 1px solid var(--stroke);
      background: var(--panel);
    }
    .workspace-card h2 {
      margin: 0 0 10px;
      font-size: 1.5rem;
      line-height: 1.08;
    }
    .workspace-copy {
      margin: 0 0 18px;
      color: var(--muted);
      font: 500 0.98rem/1.65 "Avenir Next", "Segoe UI", sans-serif;
    }
    .blocked {
      display: grid;
      gap: 16px;
      padding: 18px;
      border-radius: 22px;
      border: 1px solid color-mix(in srgb, var(--primary) 26%, white);
      background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72));
    }
    .blocked-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .state-pill {
      display: inline-flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--danger-soft);
      color: var(--danger);
      font: 700 11px/1 "IBM Plex Mono", "SFMono-Regular", monospace;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .action-copy {
      display: grid;
      gap: 8px;
    }
    .action-copy strong {
      font-size: 1.1rem;
      line-height: 1.35;
    }
    .action-copy p {
      margin: 0;
      color: var(--muted);
      font: 500 0.96rem/1.6 "Avenir Next", "Segoe UI", sans-serif;
    }
    .action-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .action-button,
    .ghost-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 14px;
      font: 700 0.92rem/1 "Avenir Next", "Segoe UI", sans-serif;
      text-decoration: none;
    }
    .action-button {
      color: rgba(17, 33, 52, 0.48);
      background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 18%, white), white);
      border: 1px solid color-mix(in srgb, var(--primary) 22%, white);
      pointer-events: none;
    }
    .ghost-button {
      color: var(--primary);
      border: 1px solid color-mix(in srgb, var(--primary) 24%, white);
      background: rgba(255,255,255,0.72);
    }
    .activity-list {
      display: grid;
      gap: 12px;
    }
    .activity-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--stroke);
      background: rgba(255,255,255,0.72);
    }
    .activity-copy {
      display: grid;
      gap: 6px;
    }
    .activity-copy strong {
      font-size: 1rem;
      line-height: 1.3;
    }
    .activity-copy span {
      color: var(--muted);
      font: 500 0.92rem/1.5 "Avenir Next", "Segoe UI", sans-serif;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--secondary) 65%, white);
      color: var(--ink);
      font: 700 11px/1 "IBM Plex Mono", "SFMono-Regular", monospace;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .side-stack {
      display: grid;
      gap: 18px;
    }
    .trust-panel p,
    .diag-copy,
    li,
    .footer-note {
      color: var(--muted);
      font: 500 0.95rem/1.65 "Avenir Next", "Segoe UI", sans-serif;
    }
    .metric {
      display: grid;
      gap: 6px;
      padding: 14px 0;
      border-top: 1px solid var(--stroke);
    }
    .metric:first-of-type {
      border-top: 0;
      padding-top: 0;
    }
    .metric strong {
      font-size: 1rem;
      line-height: 1.35;
    }
    details {
      border: 1px solid var(--stroke);
      border-radius: 18px;
      background: rgba(255,255,255,0.72);
      overflow: hidden;
    }
    summary {
      cursor: pointer;
      list-style: none;
      padding: 16px 18px;
      font: 700 0.94rem/1.2 "Avenir Next", "Segoe UI", sans-serif;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    .diag-body {
      padding: 0 18px 18px;
      display: grid;
      gap: 14px;
    }
    .mono {
      color: var(--ink);
      font: 700 0.82rem/1.5 "IBM Plex Mono", "SFMono-Regular", monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
    ul {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 10px;
    }
    .footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 24px 24px;
    }
    .back {
      color: var(--primary);
      text-decoration: none;
      font: 700 0.94rem/1 "Avenir Next", "Segoe UI", sans-serif;
    }
    @media (max-width: 920px) {
      .workspace {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel">
      <div class="topbar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true"></div>
          <div class="brand-copy">
            <strong>${escapeHtml(page.title)}</strong>
            <span>${escapeHtml(page.eyebrow)}</span>
          </div>
        </div>
        <span class="topbar-note">Customer session active</span>
      </div>
      <div class="hero">
        <span class="eyebrow">Additional verification required</span>
        <div>
          <h1>${escapeHtml(page.title)}</h1>
          <p class="summary">${escapeHtml(page.summary)}</p>
        </div>
        <div class="signal-grid">
          ${renderSignalCards(page.signals)}
        </div>
      </div>
      <div class="workspace">
        <section class="workspace-card">
          <span class="section-label">Action Center</span>
          <h2>${escapeHtml(page.primaryActionLabel)}</h2>
          <p class="workspace-copy">${escapeHtml(page.protectedAction)}</p>
          <div class="blocked">
            <div class="blocked-header">
              <strong>${escapeHtml(page.operatingState)}</strong>
              <span class="state-pill">Held for verification</span>
            </div>
            <div class="action-copy">
              <p>${escapeHtml(page.primaryActionHint)}</p>
              <p>${escapeHtml(page.whyLocked)}</p>
            </div>
            <div class="action-buttons">
              <span class="action-button" aria-disabled="true">${escapeHtml(page.primaryActionLabel)}</span>
              <span class="ghost-button">${escapeHtml(page.secondaryActionLabel)}</span>
            </div>
          </div>
          <div style="height: 18px;"></div>
          <span class="section-label">${escapeHtml(page.activitiesHeading)}</span>
          <div class="activity-list">
            ${renderActivityRows(page.activities)}
          </div>
        </section>
        <aside class="side-stack">
          <section class="workspace-card trust-panel">
            <span class="section-label">Trust Policy</span>
            <h2>Authorization boundary</h2>
            <p>${escapeHtml(page.whyLocked)}</p>
            <div class="metric">
              <span class="section-label">Required assurance</span>
              <strong>${escapeHtml(page.assurance)}</strong>
            </div>
            <div class="metric">
              <span class="section-label">Expected retry shape</span>
              <strong>Bounded capability token with DPoP sender proof</strong>
            </div>
          </section>
          <details>
            <summary>Security and access details</summary>
            <div class="diag-body">
              <div>
                <span class="section-label">Audience URI</span>
                <div class="mono">${escapeHtml(page.audience)}</div>
              </div>
              <div>
                <span class="section-label">Action profile</span>
                <div class="mono">${escapeHtml(page.actionProfile)}</div>
              </div>
              <div>
                <span class="section-label">Control notes</span>
                <ul>${cardList(page.controlNotes)}</ul>
              </div>
            </div>
          </details>
        </aside>
      </div>
      <div class="footer">
        <span class="footer-note">Need a different service? Return to the service directory.</span>
        <a class="back" href="${mockRpDirectoryHref(requestPath)}">Back to service directory</a>
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
