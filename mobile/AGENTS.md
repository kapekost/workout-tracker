This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Before declaring any task done, run the same gate CI runs, from `mobile/`:

```bash
npx expo install --check && npx expo-doctor && npx tsc --noEmit && npx expo lint && npm test \
  && npx expo export --platform ios --platform android --output-dir "$(mktemp -d)"
```

## Tests

- `src/**/*.test.ts` run with `node:test` (`npm run test:unit`): pure logic, no React Native.
- `src/**/*.test.tsx` run with Jest, `jest-expo` and React Native Testing Library (`npm run test:ui`): screens and components. In RNTL 14 `render` and `fireEvent` are async, so `await` them.
- The network is `test/fakeApi.ts`, a fake `fetch` whose replies copy what `backend/main.py` returns. Add a route there from the real endpoint's response; do not invent a shape the backend does not send.
- Give every control an agent or Maestro flow must reach a `testID`, named `<screen>-<control>` (`login-submit`, `workout-log-set`).

## Driving the app on a phone

An agent can see and tap the app on an Android phone over USB debugging, with `adb` and `agent-device` (`npx agent-device`). iPhones cannot be driven without Xcode, so they stay a manual check.

```bash
bash scripts/mobile_drive.sh start   # throwaway backend + Expo dev server on the LAN, prints a login and the open command
bash scripts/mobile_drive.sh stop    # stops both and deletes the throwaway database
```

- The phone and the machine must share a Wi-Fi network, and the phone's Expo Go must support this SDK (the Play Store copy can lag a major version).
- Both servers are reachable on the LAN over plain HTTP, and the login and session cookie cross the network unencrypted. Use it on a trusted private network only, never guest or public Wi-Fi, and stop it when finished. It is a throwaway database with a random password per run.
- It needs `backend/.venv` and `mobile/node_modules` in the same checkout. It refuses to start when its ports (8083 and 8082 by default; set `API_PORT` and `METRO_PORT`) are taken, and `stop` signals only the pids it recorded.
- Loop: `agent-device open ...` (printed by `start`), `snapshot -i`, then `fill`, `press`, `wait`. Refs go stale when the keyboard opens, so snapshot again. Decline Android's save-password prompt.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) in `src/`, and never put a test inside `app/`: it would become a route.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
