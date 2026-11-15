# Automated App Launches

- Set `DOLPHIN_BACKGROUND_LAUNCH=1` for all tests and agent-launched apps. Use
  [`dolphin-app.ts`](e2e/helpers/dolphin-app.ts) / [`dolphin-restart.ts`](e2e/helpers/dolphin-restart.ts);
  raw `electron.launch()` calls must pass the env explicitly.
- Keep windows hidden and drive renderers through Playwright CDP. Never reveal windows,
  steal focus, or activate the app on the user's desktop. `@headful` is for tests requiring
  real pixels; it does not authorize foreground activation. Never set `DOLPHIN_E2E_FOREGROUND=1`
  on the desktop.
- Run native-focus and visible-window tests only on an isolated display or CI.
- Rebuild modified launch-policy code before launching; stale wrappers are unsafe.
- Only the [terminal perf](e2e/terminal-perf-presentation.ts) and
  [native IBus](e2e/terminal-native-ibus-window.ts) fixtures, and the guarded
  [native browser image-focus test](e2e/browser-image-link-focus.spec.ts), may explicitly present windows
  on their isolated hosted-CI Xvfb displays. Preserve their guards and keep
  `DOLPHIN_BACKGROUND_LAUNCH=1`; do not generalize these exceptions to other fixtures or
  production launch policy. Background terminal panes stay hidden.
- The browser image-focus test also permits an isolated Docker Xvfb display, with
  `DOLPHIN_E2E_BROWSER_NATIVE_XVFB=1`; desktop runs must skip it.
