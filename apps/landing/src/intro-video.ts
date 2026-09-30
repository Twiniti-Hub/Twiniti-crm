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

export function injectLoopIntroVideoJsonLd(): void {
  const existing = document.querySelector('script[data-loop-intro-video-ld]');
  if (existing) {
    return;
  }

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.dataset.loopIntroVideoLd = "true";
  script.textContent = JSON.stringify(loopIntroVideoObjectJsonLd);
  document.head.appendChild(script);
}

export function renderLoopIntroVideoMarkup(): string {
  return `
    <figure class="landing-video">
      <div class="landing-video-player" data-loop-intro-video-player>
        <button
          type="button"
          class="landing-video-facade"
          data-loop-intro-video-play
          aria-label="Play video: ${LOOP_INTRO_VIDEO_TITLE}"
        >
          <img
            src="${LOOP_INTRO_VIDEO_THUMBNAIL_MAX}"
            alt="Video thumbnail: ${LOOP_INTRO_VIDEO_TITLE}"
            width="1280"
            height="720"
            loading="eager"
            fetchpriority="high"
            data-loop-intro-video-thumb
          />
          <span class="landing-video-play" aria-hidden="true">
            <svg viewBox="0 0 68 48" width="68" height="48" focusable="false">
              <path
                class="landing-video-play-bg"
                d="M66.52 7.74a8.1 8.1 0 0 0-5.7-5.74C58.1 1.07 34 1.07 34 1.07s-24.1 0-26.82 1.93a8.1 8.1 0 0 0-5.7 5.74A84.5 84.5 0 0 0 0 24a84.5 84.5 0 0 0 1.48 16.26 8.1 8.1 0 0 0 5.7 5.74C9.9 46.93 34 46.93 34 46.93s24.1 0 26.82-1.93a8.1 8.1 0 0 0 5.7-5.74A84.5 84.5 0 0 0 68 24a84.5 84.5 0 0 0-1.48-16.26Z"
              />
              <path class="landing-video-play-icon" d="M45 24 27 14v20Z" />
            </svg>
          </span>
        </button>
      </div>
      <figcaption class="landing-video-caption">
        ${LOOP_INTRO_VIDEO_DESCRIPTION}
        <a href="${LOOP_INTRO_VIDEO_WATCH_URL}" rel="noopener noreferrer">Watch on YouTube</a>
      </figcaption>
    </figure>
  `;
}

export function mountLoopIntroVideoPlayers(root: ParentNode = document): void {
  for (const playButton of root.querySelectorAll<HTMLButtonElement>("[data-loop-intro-video-play]")) {
    if (playButton.dataset.loopIntroVideoBound === "true") {
      continue;
    }
    playButton.dataset.loopIntroVideoBound = "true";

    const player = playButton.closest("[data-loop-intro-video-player]");
    if (!player) {
      continue;
    }

    playButton.addEventListener("click", () => {
      player.innerHTML = `
        <iframe
          src="${LOOP_INTRO_VIDEO_EMBED_URL}?autoplay=1"
          title="${LOOP_INTRO_VIDEO_TITLE}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
          loading="lazy"
        ></iframe>
      `;
    });
  }

  for (const thumb of root.querySelectorAll<HTMLImageElement>("[data-loop-intro-video-thumb]")) {
    if (thumb.dataset.loopIntroVideoThumbBound === "true") {
      continue;
    }
    thumb.dataset.loopIntroVideoThumbBound = "true";
    thumb.addEventListener("error", () => {
      thumb.src = LOOP_INTRO_VIDEO_THUMBNAIL_HQ;
    });
  }
}
