import { useEffect } from "react";

/**
 * Per-route <title> and meta description for the Loop SPA (Bing title/meta fix).
 * Strings come from the AEO handoff (changes.csv, 6 Oct 2026); keep them verbatim.
 */
export const PAGE_META = {
  root: {
    title: "Twiniti Loop: Marketing CRM for Agent-Ready Teams | Twiniti",
    description:
      "Twiniti Loop is a marketing CRM for agent-ready teams: contacts, segments, and approval-gated campaigns in one workspace. Sign in to your marketing hub."
  },
  signIn: {
    title: "Sign In to Twiniti Loop: Your Marketing CRM Workspace",
    description:
      "Sign in to Twiniti Loop to open your company workspace: contacts, segments, and approval-gated campaigns for your marketing team, all in one place."
  },
  signUp: {
    title: "Create a Twiniti Loop Account: Start Your Workspace",
    description:
      "Create a Twiniti Loop account to start your company workspace. You become the Company Admin and can invite your team to contacts and campaigns."
  }
} as const;

/** Sets document.title and meta[name=description] on mount; restores the previous values on unmount. */
export function usePageMeta(title: string, description: string): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousTitle = document.title;
    let tag = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !tag;
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "description";
      document.head.appendChild(tag);
    }
    const previousDescription = tag.content;
    document.title = title;
    tag.content = description;
    return () => {
      document.title = previousTitle;
      if (created) tag?.remove();
      else if (tag) tag.content = previousDescription;
    };
  }, [title, description]);
}
