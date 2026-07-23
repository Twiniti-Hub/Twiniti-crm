/** Hexclave project config. Sync with `npx @hexclave/cli dev --config-file hexclave.config.ts`. */
export default {
  projectId: process.env.HEXCLAVE_PROJECT_ID ?? "",
  auth: {
    allowSignUp: true
  },
  "auth.password": {
    allowSignIn: true
  },
  urls: {
    default: {
      type: "hosted"
    },
    home: "/",
    afterSignIn: "/",
    afterSignUp: "/",
    afterSignOut: "/"
  }
};
