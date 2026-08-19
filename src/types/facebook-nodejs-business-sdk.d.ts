// Type shim for facebook-nodejs-business-sdk (no @types package published).
// The SDK is used in 2 places: src/lib/meta/client.ts (runtime, via dynamic
// import) and scripts/probe-meta.ts (one-off dev tool, via named imports).
//
// Real SDK surface (from facebook-nodejs-business-sdk/dist/index.js):
//   module.exports.default = sdk  (the SDK's default export)
//   module.exports.FacebookAds = ...
//   module.exports.AdAccount = ...
//   etc.
//
// The codebase uses BOTH patterns:
//   - `import { createClient } from "facebook-nodejs-business-sdk"` in
//     scripts/probe-meta.ts
//   - `const { FacebookAds, AdAccount, ... } = await import("...")` in
//     src/lib/meta/client.ts — destructures from the dynamic import value,
//     which is the module's namespace object (default + named)
//
// This shim exports a single object with all the needed surface, so both
// patterns resolve. All values are `any` to avoid mirroring the SDK's
// 50+ class types. Runtime contracts handle the rest.
//
// If the SDK adds its own types later, delete this file — TS will then
// pick up the real types from node_modules/facebook-nodejs-business-sdk.
declare module "facebook-nodejs-business-sdk" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk: any;
  export = sdk;
}
