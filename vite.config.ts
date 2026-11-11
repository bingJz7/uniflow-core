import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built app works BOTH at a domain root (local dev,
  // any static host) and under a sub-path (GitHub Pages project sites such
  // as https://<user>.github.io/uniflow-core/). Fixes the Phase-1 deploy bug
  // where absolute /assets/... URLs 404'd on project pages.
  base: './',
});
