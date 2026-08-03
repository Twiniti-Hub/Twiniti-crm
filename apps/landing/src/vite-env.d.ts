/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
  readonly VITE_ENVIRONMENT_LABEL?: string;
  readonly VITE_GOOGLE_ANALYTICS_ID?: string;
  readonly Google_Analytics?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
