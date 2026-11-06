import { useHexclaveApp } from "@hexclave/react";
import { Link } from "react-router";
import { Brand } from "../components/Brand";
import { PAGE_META, usePageMeta } from "../lib/pageMeta";
import {
  LandingIntroVideo,
  LOOP_INTRO_VIDEO_THUMBNAIL_HQ,
  LOOP_INTRO_VIDEO_THUMBNAIL_MAX,
  LOOP_INTRO_VIDEO_TITLE,
  loopIntroVideoObjectJsonLd,
} from "../components/LandingIntroVideo";

export function LandingPage() {
  const app = useHexclaveApp();
  usePageMeta(PAGE_META.root.title, PAGE_META.root.description);

  return (
    <div className="landing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(loopIntroVideoObjectJsonLd) }}
      />

      <header className="landing-bar">
        <Brand />
        <div className="landing-actions">
          <Link className="secondary" to="/sign-up">
            Sign up
          </Link>
          <Link className="primary" to="/sign-in">
            Sign in
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="eyebrow">Twiniti Loop</p>
            <h1>
              Marketing CRM for
              <span className="accent"> agent-ready teams</span>
            </h1>
            <p className="landing-lede">
              Contacts, segments, and approval-gated campaigns in one workspace. Sign in to open your
              marketing hub.
            </p>
            <div className="hero-actions">
              <Link className="primary" to="/sign-in">
                Sign in to continue
              </Link>
              <button className="quiet" type="button" onClick={() => app.redirectToSignUp()}>
                Create an account
              </button>
            </div>
          </div>

          <div className="landing-hero-media">
            <LandingIntroVideo />
            <img
              className="landing-hero-still"
              src={LOOP_INTRO_VIDEO_THUMBNAIL_MAX}
              alt={`Still from ${LOOP_INTRO_VIDEO_TITLE}`}
              width={1280}
              height={720}
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.src = LOOP_INTRO_VIDEO_THUMBNAIL_HQ;
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
