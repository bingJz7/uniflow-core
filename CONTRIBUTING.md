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

Requirements: Node.js ≥ 18.

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
