/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIDECAR_HTTP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
