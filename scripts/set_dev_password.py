"""Set the password of the seeded `kapekost` profile in the database DATABASE_URL names.

For throwaway databases only (local app runs, CI): the real invite flow emails a link, which a
test run cannot follow. Reads the password from the PASSWORD environment variable, never argv.
Run it with the backend's Python from the repo root.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
import main  # noqa: E402

with main.db() as conn:
    conn.execute("UPDATE profiles SET password_hash = ? WHERE username = 'kapekost'",
                 (main.hash_password(os.environ['PASSWORD']),))
    conn.commit()
