#!/usr/bin/env python3
"""Give a profile an email address and send it a real invite.

This is how the owner's own account is created: through the same invite path
every other account uses, with no backdoor and no password argument. Running it
is deliberately the first genuine Resend send — the integration gets proven on
real infrastructure before anyone else is invited.

Run it inside the container, which is where the database and the config live:

    docker exec -e RESEND_API_KEY=... -e MAIL_FROM=... -e APP_BASE_URL=... \
        workout-tracker-workout-tracker-1 \
        python /app/scripts/bootstrap_owner.py you@example.com

If the send fails, the token is still minted and the email address is still
recorded — re-run to send again rather than being left half-done.
"""
import os
import sys

sys.path.insert(0, os.environ.get("APP_DIR", "/app"))

import main  # noqa: E402  — path has to be set first


def run(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 2
    email = argv[1]
    username = argv[2] if len(argv) > 2 else "kapekost"

    if not main.RESEND_API_KEY or not main.MAIL_FROM:
        print("error: RESEND_API_KEY and MAIL_FROM must be set — this sends a real email",
              file=sys.stderr)
        return 1
    if main.APP_BASE_URL.startswith("http://localhost"):
        print(f"error: APP_BASE_URL is {main.APP_BASE_URL!r}, so the emailed link would point at "
              "the container. Set it to the URL you actually open the app on.", file=sys.stderr)
        return 1

    try:
        result = main.bootstrap_owner(email, username=username)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"profile:  {result['username']}")
    print(f"email:    {result['email']}")
    print(f"token:    {result['kind']} "
          f"({'7 days' if result['kind'] == 'invite' else '1 hour'} to use it)")
    if result["sent"]:
        print(f"sent:     yes — check {result['email']}, then follow the link to set a password")
        return 0
    print("sent:     NO — the token exists but the email did not go out.", file=sys.stderr)
    print("          Check RESEND_API_KEY and MAIL_FROM, then re-run to send again.",
          file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(run(sys.argv))
