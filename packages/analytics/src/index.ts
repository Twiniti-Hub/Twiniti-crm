export type AnalyticsConsent = "granted" | "denied";

const CONSENT_STORAGE_KEY = "twiniti.analytics-consent";
const CONSENT_BANNER_ID = "twiniti-analytics-consent";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    __twinitiAnalyticsMeasurementId?: string;
  }
}

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAnalyticsConsent(): AnalyticsConsent | null {
  const value = getStorage()?.getItem(CONSENT_STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

export function setAnalyticsConsent(consent: AnalyticsConsent): void {
  getStorage()?.setItem(CONSENT_STORAGE_KEY, consent);
}

export function initializeGoogleAnalytics(measurementId: string): boolean {
  const id = measurementId.trim();
  if (!id || typeof window === "undefined") {
    return false;
  }

  if (window.__twinitiAnalyticsMeasurementId === id && window.gtag) {
    return true;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  window.__twinitiAnalyticsMeasurementId = id;

  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[data-twiniti-analytics="${id}"]`
  );
  if (!existingScript) {
    const script = document.createElement("script");
    script.async = true;
    script.dataset.twinitiAnalytics = id;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
  }

  window.gtag("consent", "default", {
    ad_personalization: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    analytics_storage: "denied"
  });
  window.gtag("js", new Date());
  window.gtag("config", id, {
    allow_ad_personalization_signals: false,
    allow_google_signals: false,
    anonymize_ip: true,
    send_page_view: false
  });
  window.gtag("consent", "update", { analytics_storage: "granted" });
  return true;
}

export function trackPageView(path: string, title = document.title): void {
  if (getAnalyticsConsent() !== "granted" || !window.gtag || !window.__twinitiAnalyticsMeasurementId) {
    return;
  }

  window.gtag("event", "page_view", {
    page_location: window.location.href,
    page_path: path,
    page_title: title
  });
}

export function mountAnalyticsConsentBanner(options: {
  onAccept: () => void;
}): () => void {
  if (typeof document === "undefined" || getAnalyticsConsent() !== null) {
    return () => undefined;
  }

  const existingBanner = document.getElementById(CONSENT_BANNER_ID);
  if (existingBanner) {
    return () => undefined;
  }

  const banner = document.createElement("aside");
  banner.id = CONSENT_BANNER_ID;
  banner.className = "analytics-consent-banner";
  banner.setAttribute("aria-label", "Analytics consent");
  banner.innerHTML = `
    <div class="analytics-consent-copy">
      <strong>Help us improve Twiniti</strong>
      <p>We use optional Google Analytics to understand visits and improve the product. You can accept or decline.</p>
    </div>
    <div class="analytics-consent-actions">
      <button type="button" class="analytics-consent-decline">Decline</button>
      <button type="button" class="analytics-consent-accept">Allow analytics</button>
    </div>
  `;

  const acceptButton = banner.querySelector<HTMLButtonElement>(".analytics-consent-accept");
  const declineButton = banner.querySelector<HTMLButtonElement>(".analytics-consent-decline");

  const cleanup = () => {
    acceptButton?.removeEventListener("click", accept);
    declineButton?.removeEventListener("click", decline);
    banner.remove();
  };
  const accept = () => {
    setAnalyticsConsent("granted");
    options.onAccept();
    cleanup();
  };
  const decline = () => {
    setAnalyticsConsent("denied");
    cleanup();
  };

  acceptButton?.addEventListener("click", accept);
  declineButton?.addEventListener("click", decline);
  document.body.appendChild(banner);
  return cleanup;
}
