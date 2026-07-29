/// <reference types="vite/client" />

/**
 * Pulls in Vite's ambient types, which is what makes `import.meta.env` known to
 * TypeScript (`DEV`, `PROD`, `MODE`, and friends).
 *
 * Done as a reference file rather than `"types": ["vite/client"]` in tsconfig
 * on purpose: setting `types` explicitly *replaces* automatic @types discovery
 * rather than adding to it, which would silently drop @types/three and anything
 * else picked up by default.
 */
