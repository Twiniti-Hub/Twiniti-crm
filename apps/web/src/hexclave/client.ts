import { HexclaveClientApp } from "@hexclave/react";

const projectId = import.meta.env.VITE_HEXCLAVE_PROJECT_ID?.trim() ?? "";
const publishableClientKey =
  import.meta.env.VITE_HEXCLAVE_PUBLISHABLE_CLIENT_KEY?.trim() || undefined;

export const authConfigured = Boolean(projectId);

/**
 * Same-origin auth pages (not Hexclave hosted). Hosted sign-in fails when the
 * project requires publishable client keys, because the hosted handler never
 * receives our Vite-baked `pck_`.
 */
export const hexclaveApp = authConfigured
  ? new HexclaveClientApp({
      projectId,
      ...(publishableClientKey ? { publishableClientKey } : {}),
      tokenStore: "cookie",
      urls: {
        signIn: "/sign-in",
        signUp: "/sign-up",
        forgotPassword: "/forgot-password",
        afterSignIn: "/",
        afterSignUp: "/",
        afterSignOut: "/",
        home: "/"
      }
    })
  : null;
