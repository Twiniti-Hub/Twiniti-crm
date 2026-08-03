/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
  readonly VITE_ENVIRONMENT_LABEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
