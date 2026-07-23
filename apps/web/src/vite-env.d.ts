/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_HEXCLAVE_PROJECT_ID?: string;
  readonly VITE_HEXCLAVE_PUBLISHABLE_CLIENT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
