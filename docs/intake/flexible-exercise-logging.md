# Intake Issue: Flexible Exercise Logging

## Summary
Allow users to log individual sets/exercises instead of requiring full day workouts, enabling easy logging of specific exercises (e.g., 3 sets of curls at home) without setting up a complete workout day.

## Clarifying Questions for Intake

**What we need to understand:**
- Are there user scenarios where users want to log just a few sets of a specific exercise (e.g., 3 sets of curls at home) without setting up a full day workout?
- What types of partial logging are most needed?
- Should users be able to select muscle groups directly, or exercises directly?
- How would this integrate with existing workout sessions?
- What are the core user stories for this feature?

**What is explicitly OUT of scope:**
- Rewriting the entire workout logging flow
- Complex multi-session workout planning
- Advanced workout analytics

**Constraints:**
- Should build incrementally on existing session tracking
- Should not replace existing full-day workouts (backward compatible)
- Must maintain data integrity and consistency

## Current Behavior
Users must complete a full day workout (Upper A/B, Lower A/B) before they can add individual sets/exercises. This creates friction for simple exercise logging scenarios.

## Potential User Stories
1. As a user who only wants to log 3 sets of curls, I want to directly select "biceps/curls" and log the sets without creating a full Upper/Lower workout
2. As a user who wants to track quick home workouts, I want to log individual exercises by muscle group
3. As a user who wants to add extra reps/sets to an existing workout, I want to do it without restarting the entire workout

## INVEST Analysis
- **Independent:** Clear, focused scope
- **Negotiable:** Can be adapted based on user needs
- **Valuable:** Solves real user friction
- **Estimable:** Can be measured by usage patterns
- **Small:** Starts simple, can evolve
- **Testable:** Can create clear user scenarios

## Next Steps
This intake needs owner clarification on the core user problems and constraints before it can be triaged to "ready" and planned for implementation.
