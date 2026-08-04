import "./styles.css";
import "./regional-links.css";
import "./logo-overrides.css";
import "./analytics-consent.css";
import {
  getAnalyticsConsent,
  initializeGoogleAnalytics,
  mountAnalyticsConsentBanner,
  trackPageView
} from "@twiniti/analytics";

const defaultRegionalAppUrls = {
  us: "https://loop.us.twiniti.ai",
  eu: "https://loop.eu.twiniti.ai",
  uk: "https://loop.uk.twiniti.ai"
} as const;

const regionalAppUrls = {
  us: (import.meta.env.VITE_APP_URL_US || import.meta.env.VITE_APP_URL || defaultRegionalAppUrls.us).replace(/\/$/, ""),
  eu: (import.meta.env.VITE_APP_URL_EU || defaultRegionalAppUrls.eu).replace(/\/$/, ""),
  uk: (import.meta.env.VITE_APP_URL_UK || defaultRegionalAppUrls.uk).replace(/\/$/, "")
} as const;

const regions = [
  { key: "us", label: "United States" },
  { key: "eu", label: "European Union" },
  { key: "uk", label: "United Kingdom" }
] as const;
const environmentLabel = import.meta.env.VITE_ENVIRONMENT_LABEL || "Preview";
const googleAnalyticsId =
  import.meta.env.VITE_GOOGLE_ANALYTICS_ID?.trim() || import.meta.env.Google_Analytics?.trim() || "";
const darkLogoPath = "/branding/Twiniti_Logo_Square_Dark.png";
const lightLogoPath = "/branding/Twiniti_Logo_Square_Light.png";

function link(region: keyof typeof regionalAppUrls, path: string) {
  return `${regionalAppUrls[region]}${path}`;
}

function regionalMenu(label: string, path: string, className: string) {
  const links = regions
    .map(
      ({ key, label: regionLabel }) =>
        `<a href="${link(key, path)}"><span>${regionLabel}</span><small>${regionalAppUrls[key].replace(/^https?:\/\//, "")}</small></a>`
    )
    .join("");

  return `<details class="region-menu ${className}">
    <summary>${label}</summary>
    <div class="region-menu-panel" aria-label="Choose your region">
      <strong>Choose your region</strong>
      ${links}
    </div>
  </details>`;
}

document.querySelector<HTMLDivElement>("#root")!.innerHTML = `
  <div class="site-shell">
    <nav class="nav container" aria-label="Primary navigation">
      <a class="brand" href="#top" aria-label="Twiniti Loop home">
        <img class="brand-logo brand-logo-dark" src="${darkLogoPath}" alt="Twiniti" />
        <span><strong>Loop</strong></span>
      </a>
      <div class="nav-links">
        <a href="#product">Product</a>
        <a href="#why-loop">Why Loop</a>
        <span class="environment-badge">${environmentLabel}</span>
        ${regionalMenu('Sign in <span aria-hidden="true">↗</span>', "/sign-in", "region-menu-nav")}
      </div>
    </nav>

    <main id="top">
      <section class="hero container">
        <div class="hero-copy">
          <p class="eyebrow"><span class="eyebrow-dot"></span> The marketing CRM for the whole loop</p>
          <h1>Keep every customer conversation <em>moving.</em></h1>
          <p class="hero-lede">Twiniti Loop gives growing teams one clear place for contacts, companies, campaigns, and the workflows that turn relationships into momentum.</p>
          <div class="hero-actions">
            ${regionalMenu('Start your workspace <span aria-hidden="true">→</span>', "/sign-up", "region-menu-hero button button-primary")}
            ${regionalMenu("I already use Loop", "/sign-in", "region-menu-hero button button-ghost")}
          </div>
          <p class="hero-note"><span aria-hidden="true">✦</span> Choose your country at signup. Your workspace is placed in the right data region and stays there.</p>
        </div>
        <div class="hero-art" aria-label="A visual preview of the Twiniti Loop workspace">
          <div class="orb orb-one"></div>
          <div class="orb orb-two"></div>
          <div class="dashboard-card">
            <div class="dashboard-top"><span class="window-dots"><i></i><i></i><i></i></span><span>Workspace overview</span><span class="live-pill">Live</span></div>
            <div class="dashboard-heading"><div><small>Good morning, team</small><h2>Your loop is moving</h2></div><span class="sparkle">✦</span></div>
            <div class="metric-grid"><div><span>Active contacts</span><strong>12,480</strong><b class="positive">+18.4%</b></div><div><span>Open campaigns</span><strong>08</strong><b class="positive">+03 this week</b></div></div>
            <div class="chart"><span class="chart-label">Engagement flow</span><svg viewBox="0 0 360 100" role="img" aria-label="Upward engagement chart"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#89e7d3" stop-opacity=".34"/><stop offset="1" stop-color="#89e7d3" stop-opacity="0"/></linearGradient></defs><path d="M0 82 C28 80 36 59 64 65 S94 76 120 54 S151 57 178 45 S208 55 236 31 S268 35 294 21 S327 25 360 8 V100 H0Z" fill="url(#fill)"/><path d="M0 82 C28 80 36 59 64 65 S94 76 120 54 S151 57 178 45 S208 55 236 31 S268 35 294 21 S327 25 360 8" fill="none" stroke="#89e7d3" stroke-linecap="round" stroke-width="3"/></svg></div>
            <div class="activity-row"><span class="avatar avatar-coral">MC</span><span><strong>Campaign approved</strong><small>Product launch · just now</small></span><span class="activity-check">✓</span></div>
            <div class="activity-row"><span class="avatar avatar-blue">JP</span><span><strong>New company added</strong><small>Northstar Studio · 12 min ago</small></span><span class="activity-check">✓</span></div>
          </div>
        </div>
      </section>

      <section class="proof-strip"><div class="container proof-inner"><span>Everything your team needs to keep you in the loop</span><span class="proof-line"></span><span class="proof-item">Contacts</span><span class="proof-item">Companies</span><span class="proof-item">Campaigns</span><span class="proof-item">Workflows</span></div></section>

      <section id="product" class="feature-section container">
        <div class="section-intro"><p class="eyebrow">One connected workspace</p><h2>Less tab-switching.<br /><em>More forward motion.</em></h2><p>Loop brings the daily work of customer-led growth into a calm, shared system your team can actually keep up with.</p></div>
        <div class="feature-grid">
          <article class="feature-card feature-wide"><div class="feature-icon icon-teal">◎</div><div><h3>One clear customer view</h3><p>Keep people, companies, properties, activity, and segments connected so every teammate starts with context.</p></div><div class="mini-list"><span><b class="mini-avatar">AL</b> Alex Morgan <small>Customer · Active</small></span><span><b class="mini-avatar purple">NS</b> Northstar Studio <small>Company · 24 contacts</small></span></div></article>
          <article class="feature-card"><div class="feature-icon icon-coral">↗</div><h3>Campaigns with guardrails</h3><p>Plan, review, approve, and send with the right people in the loop before a message reaches the world.</p><div class="approval"><span class="approval-dot"></span><span>Ready for approval</span><b>03</b></div></article>
          <article class="feature-card"><div class="feature-icon icon-blue">⌘</div><h3>Ready for your stack</h3><p>Use agent-friendly tools and dependable APIs to connect the work you already do with the people you already know.</p><div class="code-line"><span>loop</span><span>/contacts</span><span class="code-arrow">→</span></div></article>
        </div>
      </section>

      <section id="why-loop" class="why-section"><div class="container why-inner"><div><img class="section-logo section-logo-light" src="${lightLogoPath}" alt="Twiniti" /><p class="eyebrow">Built for trust</p><h2>Your customer data should work <em>with</em> your team.</h2></div><div class="why-points"><div><strong>01</strong><p><b>Clarity by default</b><br />A focused workspace that makes the next useful action easier to see.</p></div><div><strong>02</strong><p><b>Human approval where it matters</b><br />Automate the busywork while keeping important outbound decisions accountable.</p></div><div><strong>03</strong><p><b>Regional by design</b><br />Country-based workspace placement keeps your data boundary explicit from day one.</p></div></div></div></section>

      <section class="closing-cta container"><div class="cta-panel"><div><p class="eyebrow">Start your next loop</p><h2>Give your team a clearer way forward.</h2><p>Set up your workspace, invite your team, and make the next customer conversation count.</p></div>${regionalMenu('Create your workspace <span aria-hidden="true">→</span>', "/sign-up", "region-menu-cta button button-light")}</div></section>
    </main>

    <footer class="footer container"><a class="brand" href="#top"><img class="brand-logo brand-logo-dark" src="${darkLogoPath}" alt="Twiniti" /><span><strong>Loop</strong></span></a><div>${regionalMenu("Sign in", "/sign-in", "region-menu-footer")} ${regionalMenu("Sign up", "/sign-up", "region-menu-footer")}<span>© 2026 Twiniti Loop</span></div></footer>
  </div>
`;

function trackCurrentPage(): void {
  trackPageView(`${window.location.pathname}${window.location.search}${window.location.hash}`);
}

if (googleAnalyticsId) {
  if (getAnalyticsConsent() === "granted") {
    initializeGoogleAnalytics(googleAnalyticsId);
    trackCurrentPage();
  } else if (getAnalyticsConsent() === null) {
    mountAnalyticsConsentBanner({
      onAccept: () => {
        initializeGoogleAnalytics(googleAnalyticsId);
        trackCurrentPage();
      }
    });
  }
}
