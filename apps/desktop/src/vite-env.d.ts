/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIDECAR_HTTP?: string;
  readonly VITE_SIDECAR_HTTP_TOKEN?: string;
  /** `store` for Microsoft Store builds (disables GitHub in-app updater UI). */
  readonly VITE_RUEZZ_CHANNEL?: "store" | "github" | string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
