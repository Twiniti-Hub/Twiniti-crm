import { useCallback, useState } from "react";

export const LOOP_INTRO_VIDEO_ID = "0jkmQhBqdpg";

export const LOOP_INTRO_VIDEO_TITLE =
  "Introduction to Loop, the CRM for Startups and Founders";

export const LOOP_INTRO_VIDEO_WATCH_URL = `https://www.youtube.com/watch?v=${LOOP_INTRO_VIDEO_ID}`;

export const LOOP_INTRO_VIDEO_EMBED_URL = `https://www.youtube.com/embed/${LOOP_INTRO_VIDEO_ID}`;

export const LOOP_INTRO_VIDEO_THUMBNAIL_MAX = `https://i.ytimg.com/vi/${LOOP_INTRO_VIDEO_ID}/maxresdefault.jpg`;

export const LOOP_INTRO_VIDEO_THUMBNAIL_HQ = `https://i.ytimg.com/vi/${LOOP_INTRO_VIDEO_ID}/hqdefault.jpg`;

const LOOP_INTRO_VIDEO_DESCRIPTION =
  "Watch a short introduction to Loop, Twiniti's marketing CRM for startups and founders—contacts, segments, and approval-gated campaigns in one workspace.";

export const loopIntroVideoObjectJsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: LOOP_INTRO_VIDEO_TITLE,
  description: LOOP_INTRO_VIDEO_DESCRIPTION,
  thumbnailUrl: [LOOP_INTRO_VIDEO_THUMBNAIL_MAX, LOOP_INTRO_VIDEO_THUMBNAIL_HQ],
  contentUrl: LOOP_INTRO_VIDEO_WATCH_URL,
  embedUrl: LOOP_INTRO_VIDEO_EMBED_URL,
};

type LandingIntroVideoProps = {
  className?: string;
};

export function LandingIntroVideo({ className }: LandingIntroVideoProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const activatePlayer = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const rootClassName = ["landing-video", className].filter(Boolean).join(" ");

  return (
    <figure className={rootClassName}>
      <div className="landing-video-player">
        {isPlaying ? (
          <iframe
            src={`${LOOP_INTRO_VIDEO_EMBED_URL}?autoplay=1`}
            title={LOOP_INTRO_VIDEO_TITLE}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            className="landing-video-facade"
            onClick={activatePlayer}
            aria-label={`Play video: ${LOOP_INTRO_VIDEO_TITLE}`}
          >
            <img
              src={LOOP_INTRO_VIDEO_THUMBNAIL_MAX}
              alt={`Video thumbnail: ${LOOP_INTRO_VIDEO_TITLE}`}
              width={1280}
              height={720}
              loading="eager"
              fetchPriority="high"
              onError={(event) => {
                event.currentTarget.src = LOOP_INTRO_VIDEO_THUMBNAIL_HQ;
              }}
            />
            <span className="landing-video-play" aria-hidden="true">
              <svg viewBox="0 0 68 48" width="68" height="48" focusable="false">
                <path
                  className="landing-video-play-bg"
                  d="M66.52 7.74a8.1 8.1 0 0 0-5.7-5.74C58.1 1.07 34 1.07 34 1.07s-24.1 0-26.82 1.93a8.1 8.1 0 0 0-5.7 5.74A84.5 84.5 0 0 0 0 24a84.5 84.5 0 0 0 1.48 16.26 8.1 8.1 0 0 0 5.7 5.74C9.9 46.93 34 46.93 34 46.93s24.1 0 26.82-1.93a8.1 8.1 0 0 0 5.7-5.74A84.5 84.5 0 0 0 68 24a84.5 84.5 0 0 0-1.48-16.26Z"
                />
                <path className="landing-video-play-icon" d="M45 24 27 14v20Z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <figcaption className="landing-video-caption">
        {LOOP_INTRO_VIDEO_DESCRIPTION}{" "}
        <a href={LOOP_INTRO_VIDEO_WATCH_URL} rel="noopener noreferrer">
          Watch on YouTube
        </a>
      </figcaption>
    </figure>
  );
}
