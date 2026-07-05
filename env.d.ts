/// <reference path="./worker-configuration.d.ts" />

declare global {
  interface CloudflareEnv {
    DB: D1Database
    SYNC_SECRET: string
  }
}

export {}
