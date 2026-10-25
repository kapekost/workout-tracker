# Seeing the mobile screens in a browser

Expo web renders the same React Native screens in Chrome, so a UI change can be looked at (and
compared with the PWA) without a phone. It is a render check, not a native one: safe areas, haptics,
the keyboard and text scaling are not shown.

## Run it

```bash
cd mobile && npm ci                       # once
# a backend on :8000 (throwaway DB, password set: see AGENTS.md "Running the whole app locally")
# the PWA on :5173 (`cd frontend && npm run dev`), optional
PREVIEW_PASSWORD='<that password>' bash scripts/preview-web.sh
```

Open `http://localhost:8001/compare`: the PWA at 390 px, the mobile app at 390 px and at 320 px,
side by side. (Chrome's smallest window is about 500 px wide, which is why the phone widths are
iframes.) The PWA frame has its own login. Scroll the page sideways if the window is narrower than
the three frames. `http://localhost:8081` is the bare Expo page.

Variables: `PREVIEW_USER` (default `kapekost`), `BACKEND_URL`, `PROXY_PORT`, `EXPO_URL`, `PWA_URL`,
`PREVIEW_DIR` (the scratch copy, default under `$TMPDIR`).

## What it does, and why

- **Runs from a scratch copy**, refreshed with rsync each time, so the tracked `app.json` is never
  edited. The copy sets `web.output` to `single`: with `server` the page is HTML with no client
  script and stays blank.
- **Stubs `expo-secure-store`** (no web implementation) with an in-memory store, through a
  `metro.config.js` written into the copy.
- **A small proxy** (`preview-proxy.mjs`) logs in once and adds the session `Cookie`, because a
  browser cannot set that header, and answers CORS, which the backend does not. The app talks to
  the proxy, not to the backend.

## States worth capturing

Make them with the real API (or `curl` through the backend) rather than editing the app:

- No workout logged yet (first run), and with a completed session
- An open workout: Resume banner, then the discard confirm
- Sessions request failing (stop the backend) and Try again
- Recency failing (the muscle-group picker is hidden)
- Loading skeleton (throttle the network in DevTools)
- Muscle-group picker collapsed, expanded, one chip open
- A failed Start (409 while a workout is open)

Screenshot each at 390 and 320 px and list what was and was not seen in the PR.
