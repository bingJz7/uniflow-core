# E2E evidence — UniFlow Core v0.1.1

Screenshots and machine-readable logs from the real-browser E2E suite
(`e2e-round2-script.cjs`). **All calendar data is fictional** (Riverbend Uni
demo calendar). No personal paths, credentials or real student data are
stored here.

## How to reproduce

See [CONTRIBUTING.md](../../CONTRIBUTING.md) → "Browser E2E test". Short version:

```bash
npx @puppeteer/browsers install chrome@stable               # once
npm install playwright-core                                   # once, any scratch dir
npm run build
npx http-server dist -p 8765 -a 127.0.0.1                     # serve dist/

UNIFLOW_CHROME="/path/to/Google Chrome for Testing" \
NODE_PATH=/path/to/scratch/node_modules \
node docs/e2e-evidence/e2e-round2-script.cjs
echo $?   # 0 = all checks passed, 1 = at least one FAIL
```

The script is repeatable: it clears localStorage in-page and uses a fresh
Chrome profile per run (temp dir), so two consecutive runs produce identical
results. Fixtures are generated at runtime from
`examples/sample-calendar.ics`.

## Files

| File | Round | What it shows |
| --- | --- | --- |
| `e2e-log.json`, `01…08-*.png` | round 1 (v0.1.1 remediation) | baseline flows: onboarding, Today, All, digest, second import, vanished, settings, zh-CN |
| `e2e-round2-log.json`, `r2-01…r2-06-*.png` | round 2 review | migration, kept-visible, overdue view, empty re-import, export, clear-all |
| `e2e-final-log.json`, `f1-*.png`, `f2-*.png`, `f3-*.png` | final release gate | **authoritative**: 31/31 checks — kept-event management (keep → refresh → archive), STATUS:CANCELLED visibility, colon/slash UID migration, strict counts |
| `r2-04/05/06-*.png` | final release gate (regenerated) | empty re-import, export JSON, clear-all |

`e2e-final-log.json` is the log of the final-gate run and the file the release
decision should be based on.
