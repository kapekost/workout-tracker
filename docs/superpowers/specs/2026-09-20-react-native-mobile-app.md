# Spec: React Native Mobile App (Expo)

## 1. Goal
Implement a native mobile application for iOS and Android using Expo (React Native). This app will eventually replace or supplement the PWA, providing better native integration (notifications, background tasks, haptics).

## 2. Architecture

### 2.1 Stack
- **Framework**: Expo (SDK 51+).
- **Navigation**: Expo Router (File-based navigation).
- **State/Data**: `react-query` (TanStack Query) for server state; `zustand` for local state (workout session).
- **API**: Shared `api-client` logic (ported from `frontend/src/api/`).
- **Styling**: Native StyleSheet using tokens from `frontend/src/lib/theme.js`. No CSS frameworks.

### 2.2 Shared Logic
- The `mobile/` folder will be a sibling to `frontend/` and `backend/`.
- We will attempt to share as much business logic as possible, starting with the design tokens.

## 3. Implementation Phases

### Phase 1: Foundations
- Project initialization (Expo).
- Design token integration.
- API Client setup with auth persistence.
- Navigation shell (Login -> Home).

### Phase 2: Workout Logging
- Exercise list and detail views.
- Active workout session UI (Sets/Reps/Weight).
- Rest timer integration.

### Phase 3: Native Enhancements
- Background notifications for rest timer.
- Haptics on set completion.
- Screen "Stay Awake" during workout.

## 4. User Experience (UX)
- One-handed use: Primary actions (Log Set, Next Exercise) must be reachable with the thumb.
- High contrast: Clear visibility in gym lighting.
- Immediate feedback: Use haptics and animations to confirm actions.

## 5. Security
- Use `expo-secure-store` for session tokens.
- Standard JWT/Cookie auth matching the backend's expectations.

## 6. Implementation Order
1. `mobile/` project init.
2. Design tokens port.
3. Auth flow.
4. Exercise list.
5. Workout session.
