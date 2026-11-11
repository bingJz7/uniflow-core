# Third-party notices

UniFlow Core is MIT-licensed. It includes these open-source dependencies at build time:

| Dependency | License | Use |
|---|---|---|
| [ical.js](https://github.com/mozilla-comm/ical.js) | MPL-2.0 | RFC 5545 iCalendar parsing (runtime dependency) |
| [Vite](https://vitejs.dev) | MIT | Build tool (dev) |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 | Type checking (dev) |
| [Vitest](https://vitest.dev) | MIT | Test runner (dev) |

MPL-2.0 notice for ical.js: this project uses ical.js as an unmodified library dependency via npm. Under MPL-2.0 §3.3 the library's source remains available at the upstream repository; linking via npm does not require this project's source to become MPL-licensed. If you redistribute UniFlow, keep the npm dependency reference (or include ical.js source and its license notice) so recipients can access it under MPL-2.0.

Run `npm ls` / `npm run build` to reproduce the exact dependency tree for a given release.
