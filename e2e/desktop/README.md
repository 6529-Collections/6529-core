# Desktop function suite and runtime budget

Checks that a packaged 6529 Desktop build still does everything the
previous release did, and measures what it costs to run. Both drive the
packaged app over the Chrome DevTools Protocol with a scratch profile; neither
touches the real user profile.

## Function suite

```bash
pnpm exec tsx e2e/desktop/run.ts --exe "dist/win-unpacked/6529 Desktop Staging.exe" --routes smoke
```

Options:

- `--routes none|smoke|all`: route pass over the smoke list (default) or
  every page route of `renderer/app`.
- `--external-browsers`: also press "Open in Chrome/Brave/Firefox" for the
  external-browser wallet connector. This opens real browser windows; only
  processes started with this run's marker URL are stopped afterwards.
- `--no-lifecycle`: skip the close dialog, background mode, restore and quit
  (Windows UI Automation; they end the app).
- `--baseline <function-suite.json>`: compare with an earlier report; the run
  fails only on checks or routes that passed before and fail now.
- `--profile <dir>`: reuse a profile (warm start) instead of a fresh one.
- `--extra-arg <arg>`: pass an argument to the app (for example
  `--no-sandbox` in a Linux container).

The report (`function-suite.md` and `.json`) lists every check against the
function list of the desktop slimming plan:

| | Function | Checked by |
| --- | --- | --- |
| F1 | Every page route | Route pass: no server error, error page or blank page. Dynamic routes use the build's prerendered paths, public NFT ids, or a public profile and wave looked up at run time; a route without a sample value is reported as skipped |
| F2 | Desktop-only pages | `/core/*` render; core info shows the ports |
| F3 | Seed wallets | Create, list, import (Hardhat's public test mnemonic), decrypt with the password, sign and verify, reject a wrong password, delete; new wallets use the v2 envelope |
| F4 | Wallet connections | The external-browser connector page in Chrome and Firefox; "Open in Chrome/Brave/Firefox" with `--external-browsers` |
| F5 | IPFS | Endpoints reported; add a file through the API and read it back through the gateway; the WebUI window opens |
| F6 | Background jobs and RPC providers | Add, activate, deactivate and delete a provider (a closed local port, so no chain is touched); start, stop, reset, full refresh, recalculate owners, reconcile |
| F7 | Renderer server functions | Link preview, image proxy allowlist, meme calendar, Alchemy contract read, version |
| F8 | Shell | Notification, badge, title bar label, Ctrl+F search shortcut, deep link from a second launch (single instance), connection-sharing deep link, close dialog |
| F9 | Background mode and splash | Splash at launch; Run in Background keeps the app serving; restore reopens the window |
| F10 | Updates | The update check reaches the build's feed. The update path itself is tested with `update-path.ts` |
| F11 | Logs and crash dumps | Read the main log, open a log window, list dumps |
| F12 | Sessions | The main-process session bridge; on a test-backend build, sign in with the test wallet, create a connection share for a phone, sign out |
| F13 | Rust core | Not in the app yet |

Signed-in checks run only against a build made for the test backend
(`6529 run dist-win-staging test`): signing in against the live backend
would create a production session.

## Runtime budget

```bash
pnpm exec tsx e2e/desktop/runtime.ts --exe "dist/win-unpacked/6529 Desktop Staging.exe" \
  --fresh 5 --warm 10 --budget config/desktop-runtime-budget.json
```

Per launch: time to the splash and to the main window (from `main.log`),
whether the app stayed on the splash, private working set per process on the
home screen after the settle time, CPU over the idle window, and renderer
requests in that window. `runtime.md` has the medians and every run.
Timings and CPU depend on the machine (a machine without a GPU composites
the home screen's video in software), so compare runs from the same machine.

## Machine hygiene

Each launch of a packaged build rewrites the protocol handler under
`HKCU\Software\Classes\<scheme>`; the scripts export it before launching and
restore it afterwards. A forced stop leaves Kubo running and a crashpad
`debug.log` beside the executable; the scripts stop the Kubo daemon of the
scratch profile and delete that file.
