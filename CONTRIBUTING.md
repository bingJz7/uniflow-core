# Contributing to UniFlow Core

Thank you for helping make deadline management less painful for students everywhere. 🪙

## Ground rules (non-negotiable)

1. **No AI in core features.** `src/rules.ts` and everything the dashboard depends on must stay deterministic. AI experiments belong in the separate `uniflow-skills` project.
2. **Privacy first.** Never add a network call to a core feature. Never log user calendar content or URLs. Never commit real student data — all test/demo fixtures must be fictional.
3. **Never fabricate data.** If a feature cannot verify something (e.g. LMS submission state), the UI must not imply otherwise.
4. **Beginner friendly.** Changes must not add setup steps for end users (no "run this script first").

## Setup

```bash
git clone <your fork>
cd uniflow-core
npm install
npm run dev      # start dev server
npm test         # run the test suite
npm run build    # type-check + production build
```

Requirements: Node.js `^22.12.0 || ^24.0.0 || >=26.0.0` (Vitest 5 / Vite 7 requirement — see `package.json` `engines`). Node 20 and below are not supported.

## Browser E2E test (optional, repeatable)

The unit suite (`npm test`) is the CI gate. A real-browser E2E script lives in
`docs/e2e-evidence/e2e-round2-script.cjs` and is fully self-contained: it
derives its ICS fixtures at runtime from `examples/sample-calendar.ics`
(all fictional), writes logs/screenshots to a temp directory, and exits
non-zero if any check fails. No personal paths, no credentials, no real
student data.

Prerequisites (one-time, outside the repo's dependencies):

```bash
# 1. Install Chrome for Testing (any location), e.g.:
npx @puppeteer/browsers install chrome@stable
# 2. Install playwright-core somewhere reachable, e.g. a scratch dir:
npm install playwright-core
# 3. Build the app and serve dist/ as a web root:
npm run build
npx http-server dist -p 8765 -a 127.0.0.1
```

Run the E2E suite (from the repo root):

```bash
UNIFLOW_CHROME="/path/to/Google Chrome for Testing" \
UNIFLOW_E2E_BASE="http://127.0.0.1:8765/" \
NODE_PATH=/path/to/scratch/node_modules \
node docs/e2e-evidence/e2e-round2-script.cjs
```

Environment variables:

| Variable             | Default                          | Purpose                          |
| -------------------- | -------------------------------- | -------------------------------- |
| `UNIFLOW_CHROME`     | – (required)                     | Path to a Chrome for Testing binary |
| `UNIFLOW_E2E_BASE`   | `http://127.0.0.1:8765/`         | URL the app is served at         |
| `UNIFLOW_E2E_OUT`    | `<os tmp>/uniflow-e2e-out`       | Output dir for logs/screenshots  |
| `UNIFLOW_E2E_PROFILE`| fresh temp dir per run           | Chrome user-data dir             |

The script is repeatable: each run uses a fresh Chrome profile and clears
localStorage in-page, so consecutive runs produce identical results. Exit
code is `0` only when every check passes (`1` otherwise); the JSON log is
written to `$UNIFLOW_E2E_OUT/e2e-round2-log.json`.

## Code style

- TypeScript strict mode; no `any` unless unavoidable.
- Vanilla TS DOM — no framework without an architecture-decision discussion.
- Every new rule-engine / parser behavior needs a test in `tests/`.
- Run `npm test && npm run build` before opening a PR.

## Pull requests

1. Fork → branch (`feat/...` or `fix/...`).
2. Keep PRs focused; one behavior change per PR.
3. Describe what changed and why; include test output.
4. For architecture-level changes (new dependency, new network call, storage change), open an Issue first and record the decision in `docs/ARCHITECTURE_DECISIONS.md` once agreed.

## Reporting bugs

Include: browser & OS, steps to reproduce, expected vs actual behavior. **Redact any real course/personal data before pasting.**
