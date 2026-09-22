# Plan: React Native Init & Foundations

This plan covers the initialization of the `mobile/` React Native (Expo) project and the integration of the project's design tokens.

## 1. Project Bootstrap
- [ ] Create `mobile/` directory.
- [ ] Initialize Expo project using `npx create-expo-app@latest mobile --template tabs`.
- [ ] Install core dependencies:
  - `expo-router` (if not in template)
  - `expo-secure-store` (for auth)
  - `expo-haptics`
  - `expo-notifications`
  - `@tanstack/react-query`
  - `lucide-react-native` (for icons, matching PWA)

## 2. Design Token Porting
- [ ] Create `mobile/src/theme/tokens.js`.
- [ ] Port colors, spacing, and radius from `frontend/src/lib/theme.js`.
- [ ] Adjust `rem` values to pixel-based values suitable for mobile (e.g., `0.75rem` -> `14px`).

## 3. Global Styles & Providers
- [ ] Set up `QueryClientProvider` in `mobile/app/_layout.tsx`.
- [ ] Create a `ThemedText` component that uses the design tokens by default.
- [ ] Set up the default background color (`colors.bg`) in the root layout.

## 4. API Client Shell
- [ ] Create `mobile/src/api/client.ts`.
- [ ] Implement basic `fetch` wrapper that handles the `BASE_URL`.
- [ ] Add session token injection from `SecureStore`.

## 5. Verification
- [ ] `npx expo lint` (if configured).
- [ ] `npx expo start` and verify the app renders a basic themed screen.
- [ ] Verify `ThemedText` renders correctly with the expected color and size.

## Linked Issue
Closes #201 (Phase 1)
