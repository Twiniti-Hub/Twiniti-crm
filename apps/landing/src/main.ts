import "./fonts.css";
import "./styles.css";
import "./intro-video.css";
import "./analytics-consent.css";
import {
  injectLoopIntroVideoJsonLd,
  mountLoopIntroVideoPlayers,
  renderLoopIntroVideoMarkup,
} from "./intro-video";
import { renderProductVisual } from "./product-visual";
import {
  getAnalyticsConsent,
  initializeGoogleAnalytics,
  initializeMicrosoftClarity,
  mountAnalyticsConsentBanner,
  trackPageView
} from "@twiniti/analytics";

// Trial sub-line shown under both "Start free" buttons. George is deciding the
// final wording (pending), so change it here only.
export const TRIAL_SUBLINE = "Try it free for 7 days.";

const googleAnalyticsId =
  import.meta.env.VITE_GOOGLE_ANALYTICS_ID?.trim() || import.meta.env.Google_Analytics?.trim() || "";
const microsoftClarityId = import.meta.env.VITE_MICROSOFT_CLARITY_ID?.trim() || "xyd0gcl234";
const analyticsConfigured = Boolean(googleAnalyticsId || microsoftClarityId);

const SIGN_UP_URL = "https://loop.twiniti.ai/sign-up";
const SIGN_IN_PATH = "/sign-in";
const logoPath = "/branding/loop-logo-light.png";

// Legal's approved wording; keep byte for byte.
const WEB_VISITORS_PRIVACY_LINE =
  "Load the Web Visitors code only after your site's consent controls allow it. Loop doesn't provide a consent banner. You're responsible for your privacy notice and for any consent, notice, or opt-out the law requires where you operate.";

function startFree(): string {
  return `
    <div class="cta-block">
      <a class="button button-primary" href="${SIGN_UP_URL}">Start free <span aria-hidden="true">→</span></a>
      <p class="trial-line">${TRIAL_SUBLINE}</p>
    </div>`;
}

const features = [
  ["One record per customer.", "People, companies, custom fields, activity and segments stay connected, so whoever picks up the thread starts with context."],
  ["Email that logs itself.", "Once you connect your email domain in Settings, BCC your Loop address on an email and Loop adds it to the contact's timeline."],
  ["Campaigns with a second check.", "In an Organization workspace, build a segment, write the campaign, and send it once another admin approves it."],
  ["Your data, in your region.", "Choose your country when you sign up, and Loop places your workspace in its US, UK or EU region."],
  ["Works with AI agents.", "Agents can help with contacts and campaign drafts. A campaign still sends only after an admin approves it."]
];

const steps = [
  ["Create your workspace.", "Choose a personal workspace for yourself or an Organization workspace for your team, then pick your country."],
  ["Bring your contacts.", "Upload a CSV file, or sync Google or iCloud contacts into a personal workspace. Sync only reads; Loop never changes contacts at the source."],
  ["Follow up.", "Build segments, log email by BCC, run approved campaigns in an Organization workspace, and see matched site visits on the right contact."]
];

const questions: Array<[string, string[]]> = [
  ["What does Loop cost?", ["Personal is $9/mo and Organization is $29/mo after the 7-day trial."]],
  ["Can I bring my existing contacts?", ["Yes. Upload a CSV file. Loop maps the columns it recognizes, and every other column becomes a custom field. In a personal workspace you can also sync Google or iCloud contacts."]],
  ["What's the difference between a personal workspace and an Organization workspace?", ["A personal workspace is just for you and doesn't take invites. An Organization workspace has members and invites, plus campaigns. You can have both and switch between them."]],
  ["Who approves a campaign?", ["In an Organization workspace, one person requests approval and a different admin approves it before it sends. Personal workspaces don't include campaigns."]],
  ["What do I need for the Web Visitors module?", [
    "You need an account with a visitor-identification service and its website key. Save the key in Loop's Settings, paste the installation code Loop gives you into your site, and publish. Loop then checks that the code is on your published page.",
    WEB_VISITORS_PRIVACY_LINE
  ]],
  ["Where is my data stored?", ["You choose your country when you sign up. UK workspaces go to Loop's UK region, EU countries to its EU region, and every other country to its US region. Your workspace's data is kept in that region."]]
];

document.querySelector<HTMLDivElement>("#root")!.innerHTML = `
  <div class="site-shell">
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <nav class="nav container" aria-label="Primary">
        <a class="brand" href="#top" aria-label="Twiniti Loop home">
          <img class="brand-logo" src="${logoPath}" alt="" width="56" height="56" />
          
        </a>
        <div class="nav-links">
          <a href="#product">Product</a>
          <a href="#questions">Questions</a>
          <a class="nav-signin" href="${SIGN_IN_PATH}">Sign in</a>
        </div>
      </nav>
    </header>

    <main id="main">
      <div id="top" class="banner"><p class="container"><span class="banner-dot" aria-hidden="true"></span>New in Loop: personal workspaces and the Web Visitors module.</p></div>

      <section class="hero container" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow">The CRM for small businesses</p>
          <h1 id="hero-title">Your contacts, campaigns and site visitors in one CRM.</h1>
          <p class="hero-lede">Customers spread across your inbox, phone and spreadsheets? Loop puts them in one place, so you follow up before leads go cold.</p>
          ${startFree()}
        </div>
        <div class="hero-visual">${renderProductVisual()}</div>
      </section>

      <section id="product" class="section section-alt" aria-labelledby="product-title">
        <div class="container">
          <h2 id="product-title" class="section-title">What's in Loop</h2>
          <div class="stat card">
            <p class="stat-claim"><strong>23% of companies never responded to an online sales lead.</strong> <span class="stat-tag">(HBR, 2011)</span></p>
            <p>Loop keeps every lead and its history in one place, so the follow-up is easier to see.</p>
            <p class="source"><small>Source: Harvard Business Review, "The Short Life of Online Sales Leads" (2011), a study of 2,241 US companies. <a href="https://hbr.org/2011/03/the-short-life-of-online-sales-leads" rel="noopener noreferrer">https://hbr.org/2011/03/the-short-life-of-online-sales-leads</a></small></p>
          </div>
          <ul class="feature-grid">
            ${features.map(([title, body]) => `<li class="card feature"><h3>${title}</h3><p>${body}</p></li>`).join("")}
          </ul>
          <div class="video-block">${renderLoopIntroVideoMarkup()}</div>
        </div>
      </section>

      <section class="section" aria-labelledby="how-title">
        <div class="container">
          <h2 id="how-title" class="section-title">How it works</h2>
          <ol class="steps">
            ${steps.map(([title, body], index) => `<li class="card step"><span class="step-num" aria-hidden="true">${index + 1}</span><h3>${title}</h3><p>${body}</p></li>`).join("")}
          </ol>
        </div>
      </section>

      <section class="section section-alt" aria-labelledby="new-title">
        <div class="container">
          <h2 id="new-title" class="section-title">New in Loop</h2>
          <div class="new-grid">
            <article class="card card-lg new-item">
              <p class="chip">Personal workspaces</p>
              <h3>A CRM that's only yours.</h3>
              <p>A personal workspace is a CRM for one, separate from any Organization workspace. Sync your Google or iCloud contacts and keep them current without touching the originals.</p>
            </article>
            <article class="card card-lg new-item">
              <p class="chip">The Web Visitors module</p>
              <h3>Match site visits to your contacts.</h3>
              <p>Quick setup: connect your visitor-identification account, then add Loop's code to your website. When a visit can be matched to a person or company, Loop records it on that record, so you know who to follow up with.</p>
              <p class="privacy-note">${WEB_VISITORS_PRIVACY_LINE}</p>
            </article>
          </div>
        </div>
      </section>

      <section id="questions" class="section" aria-labelledby="questions-title">
        <div class="container narrow">
          <h2 id="questions-title" class="section-title">Questions</h2>
          <div class="faq">
            ${questions.map(([q, answers]) => `<div class="faq-item"><h3>${q}</h3>${answers.map((a) => `<p>${a}</p>`).join("")}</div>`).join("")}
          </div>
        </div>
      </section>

      <section class="section closing" aria-labelledby="closing-title">
        <div class="container">
          <div class="closing-panel card-lg">
            <h2 id="closing-title">Answer the next lead while it's still warm.</h2>
            <p>Open a workspace, bring your contacts, and follow up from one place.</p>
            ${startFree()}
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="container footer-inner">
        <a class="brand" href="#top" aria-label="Twiniti Loop home"><img class="brand-logo" src="${logoPath}" alt="" width="44" height="44" /></a>
        <p>© 2026 Twiniti Loop</p>
      </div>
    </footer>
  </div>
`;

injectLoopIntroVideoJsonLd();
mountLoopIntroVideoPlayers();

function trackCurrentPage(): void {
  trackPageView(`${window.location.pathname}${window.location.search}${window.location.hash}`);
}

function initializeOptionalAnalytics(): void {
  if (googleAnalyticsId) {
    initializeGoogleAnalytics(googleAnalyticsId);
  }
  if (microsoftClarityId) {
    initializeMicrosoftClarity(microsoftClarityId);
  }
}

if (analyticsConfigured) {
  if (getAnalyticsConsent() === "granted") {
    initializeOptionalAnalytics();
    trackCurrentPage();
  } else if (getAnalyticsConsent() === null) {
    mountAnalyticsConsentBanner({
      onAccept: () => {
        initializeOptionalAnalytics();
        trackCurrentPage();
      }
    });
  }
}
