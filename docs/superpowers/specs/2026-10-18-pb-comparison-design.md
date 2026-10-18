# Personal best comparison (#389)

Status: proposal. The privacy choice below is the owner's; nothing is implemented.

## What

Under the user's own best for an exercise on the Personal Bests page, one quiet line shows the top three bests among other members, for example "Top 3 here: 120, 110, 105 kg". The user's own PB stays the main thing. No leaderboard screen, no rank numbers, no names unless the owner wants them.

## Owner decisions

1. **Consent.** Recommended: opt-in per profile, off by default ("Show my bests to others in this gym"). Only opted-in profiles feed the line. Not opted in: you still see the line, you are just not in it. Alternative: opt-out, which exposes data before anyone chose.
2. **Identity.** Recommended: anonymous, no names or ranks, just the values. Alternative: usernames, which turns the line into a competition.

Both need a profile flag, so this is a schema change (v10) and needs an export snapshot before deploy.

## Like for like

Compare the same exercise on one basis for everyone: the estimated 1RM already used for PR detection (same formula as the "est. 1RM" PR toast). The line says "est. 1RM", so the numbers are never read as loads lifted. Raw weight is not compared, because 100 kg for 10 reps and 100 kg for 1 are different bests.

## Read endpoint

`GET /api/personal-bests/top?exercise_id=...` for the acting session's profile.

- Returns at most three numbers, sorted, from opted-in profiles other than the caller. No profile id, name, date or set id leaves the server.
- Reads only `personal_bests` and `sets` aggregates, never sessions or notes.
- Requires a session like every data endpoint; 401 otherwise.
- Tests: a member sees only aggregates, an opted-out profile never appears, the caller is excluded, an unknown exercise returns an empty list.

## Few users

Fewer than 3 opted-in other members: hide the line rather than show one or two values, which would identify a person in a small gym. The threshold is a constant, not a setting.

## UX

One muted line (`colors.muted`, small size) under the user's PB, wraps at 390px, no icon, no color for better or worse. A toggle for the consent flag sits on the profile or Personal Bests page, with one sentence saying what is shared.

## Copy and claims

No claim about what the numbers mean for the user's training. Run `workout-science` on the wording and `staff-engineer-reviewer` on the endpoint scoping before merge.

## Out of scope

Names, ranks, history, per-set detail, notifications, any export of other members' data.
