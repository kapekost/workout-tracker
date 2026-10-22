## Summary

<!-- What changed and why. Link the Issue: Closes #N -->

## Test plan

- [ ] Verification commands from the task/plan were run and passed
- [ ] CI is green
- [ ] User-visible change: one plain-language entry added to `frontend/src/lib/changelog.json` (or the exact line `Changelog: none` alone in the description, nothing after it; CI checks this, and a failure is fixed by editing the body, not by rerunning)

## Guardrails checklist

- [ ] Not a direct push to the default branch
- [ ] No destructive operation without an `approved` label on its Issue
- [ ] No secret/credential added to a tracked file
