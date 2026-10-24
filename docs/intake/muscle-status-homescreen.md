# Intake Issue: Improved Muscle Status Visibility on Homescreen

## Summary
Make muscle group status more visible on the homescreen with a quick glance view separate from the current muscle-group workout swap feature.

## Clarifying Questions for Intake

**What we need to understand:**
- What information should be prioritized in the quick glance view (e.g., last workout date, recovery status, readiness scores)?
- What is the optimal placement and format for this quick view (top section, smaller space)?
- How should this differ from the current muscle-group picker feature (which swaps entire workouts)?
- What data needs to be displayed to help users make quick decisions about their workout?
- What is the target visual hierarchy and information architecture?

**What is explicitly OUT of scope:**
- Redesigning the entire homescreen layout
- Major visual overhaul of the application
- Adding new workout planning features

**Constraints:**
- Should not interfere with the existing muscle-group picker workflow
- Should maintain the current feature's effectiveness
- Should build on existing data structures (last workout, recovery status, etc.)
- Must work well on mobile devices

## Current Behavior
Muscle group status is not easily visible at a glance on the homescreen, requiring users to navigate to see details about their muscle group readiness or last workout.

## Potential User Stories
1. As a user, I want to see at a glance which muscle groups are fresh/recently trained so I can make quick workout decisions
2. As a user, I want to understand my muscle group recovery status without digging through menus
3. As a user, I want to see when I last trained each muscle group for better workout planning

## INVEST Analysis
- **Independent:** Clear scope focused on visibility
- **Negotiable:** Can be adapted based on user preferences
- **Valuable:** Solves the problem of hidden muscle status information
- **Estimable:** Can be measured by time-to-information
- **Small:** Starts with key metrics, can evolve
- **Testable:** Can create clear user scenarios for quick assessment

## Next Steps
This intake needs owner clarification on:
- What metrics should be prioritized
- What is the optimal visual design
- How this should integrate with existing features

Once clarified, this can be split into implementable pieces.
