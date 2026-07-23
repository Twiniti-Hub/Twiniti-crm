import { HexclaveClientApp } from "@hexclave/react";

const projectId = import.meta.env.VITE_HEXCLAVE_PROJECT_ID?.trim() ?? "";
const publishableClientKey =
  import.meta.env.VITE_HEXCLAVE_PUBLISHABLE_CLIENT_KEY?.trim() || undefined;

export const authConfigured = Boolean(projectId);

export const hexclaveApp = authConfigured
  ? new HexclaveClientApp({
      projectId,
      ...(publishableClientKey ? { publishableClientKey } : {}),
      tokenStore: "cookie",
      urls: {
        default: { type: "hosted" },
        afterSignIn: "/",
        afterSignUp: "/",
        afterSignOut: "/",
        home: "/"
      }
    })
  : null;
