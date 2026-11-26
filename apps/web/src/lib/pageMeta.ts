import { useEffect } from "react";

export type PageMetaSpec = {
  title: string;
  description: string;
  canonicalPath?: string;
  ogImagePath?: string;
  robots?: string;
};

function absolutePublicUrl(path: string) {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).href;
}

/**
 * Per-route document metadata for public Loop funnel pages.
 * Copy: Don SIGNUP-CTA pack (17 Nov 2026) and TWI-1117 pricing brief.
 */
export const PAGE_META = {
  root: {
    title: "Twiniti Loop | The CRM for small businesses",
    description:
      "Loop is the CRM for small businesses. Keep contacts, campaigns, and site visitors in one place, so you follow up before leads go cold.",
    canonicalPath: "/",
    ogImagePath: "/branding/loop-logo-light.png"
  },
  signIn: {
    title: "Sign in to Loop | Twiniti",
    description:
      "Sign in to Twiniti Loop to open your workspace: contacts, segments, and campaigns for your team, all in one place."
  },
  signUp: {
    title: "Create your Loop account | Twiniti",
    description:
      "Create your Twiniti Loop account and start a 7-day free trial. Loop keeps your contacts, campaigns, and site visitors in one place.",
    canonicalPath: "/sign-up",
    ogImagePath: "/branding/loop-logo-light.png"
  },
  pricing: {
    title: "Loop pricing | Twiniti",
    description:
      "Twiniti Loop is $9/month for Personal and $29/month for an Organization, after a 7-day free trial.",
    canonicalPath: "/pricing",
    ogImagePath: "/branding/loop-logo-light.png"
  }
} as const satisfies Record<string, PageMetaSpec>;

function upsertLinkTag(rel: string, href: string) {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const created = !link;
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
  return { link, created };
}

function upsertMetaName(name: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const created = !tag;
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
  return { tag, created };
}

function upsertMetaProperty(property: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  const created = !tag;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  tag.content = content;
  return { tag, created };
}

/** Sets title, description, canonical, OG tags, and robots on mount; restores on unmount. */
export function usePageMeta(title: string, description: string, spec?: Partial<PageMetaSpec>): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousTitle = document.title;
    const previousDescription =
      document.head.querySelector<HTMLMetaElement>(`meta[name="description"]`)?.content ?? "";
    const descriptionTag = upsertMetaName("description", description);

    const canonical = spec?.canonicalPath
      ? upsertLinkTag("canonical", absolutePublicUrl(spec.canonicalPath))
      : null;

    const ogTitle = upsertMetaProperty("og:title", title);
    const ogDescription = upsertMetaProperty("og:description", description);
    const ogUrl = spec?.canonicalPath ? upsertMetaProperty("og:url", absolutePublicUrl(spec.canonicalPath)) : null;
    const ogImage = spec?.ogImagePath
      ? upsertMetaProperty("og:image", absolutePublicUrl(spec.ogImagePath))
      : null;

    const robots = spec?.robots ? upsertMetaName("robots", spec.robots) : null;

    document.title = title;

    return () => {
      document.title = previousTitle;
      descriptionTag.tag.content = previousDescription;
      if (descriptionTag.created) descriptionTag.tag.remove();
      if (canonical?.created) canonical.link.remove();
      if (ogTitle.created) ogTitle.tag.remove();
      if (ogDescription.created) ogDescription.tag.remove();
      if (ogUrl?.created) ogUrl.tag.remove();
      if (ogImage?.created) ogImage.tag.remove();
      if (robots?.created) robots.tag.remove();
    };
  }, [description, spec?.canonicalPath, spec?.ogImagePath, spec?.robots, title]);
}