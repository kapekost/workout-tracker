"""Seed a throwaway DB for UX screenshots: eight weeks of the 4-day split for the owner profile,
and a known password. Never point this at a real database.

Usage: DATABASE_URL=/tmp/ux.db backend/.venv/bin/python scripts/ux_seed.py
Run once the backend has started against the same DATABASE_URL (it creates the schema and plan).
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
db_path = os.environ.get('DATABASE_URL', '')
if not db_path.startswith('/tmp/'):
    sys.exit('ux_seed.py: DATABASE_URL must be a throwaway file under /tmp/')
import main
import sqlite3, datetime as dt, random
random.seed(4)
c=sqlite3.connect(db_path); c.row_factory=sqlite3.Row
days=[r['day_key'] for r in c.execute('select day_key from plan_days where profile_id=1 order by sort_order')]
ex={d:[dict(r) for r in c.execute('select pe.* from plan_exercises pe join plan_days pd on pd.id=pe.plan_day_id where pd.day_key=? and pd.profile_id=1 order by pe.sort_order',(d,))] for d in days}
base={}
today=dt.date.today()
n=0
for w in range(8):
  for i,d in enumerate(days):
    date=today-dt.timedelta(days=56-w*7-i*2)
    if date>=today: continue
    start=dt.datetime.combine(date,dt.time(18,5))
    cur=c.execute('insert into sessions(date,workout_day,completed,created_at,ended_at,profile_id) values(?,?,1,?,?,1)',(date.isoformat(),d,start.isoformat(sep=' '),(start+dt.timedelta(minutes=58)).isoformat(sep=' ')))
    sid=cur.lastrowid; t=start
    for e in ex[d]:
      b=base.setdefault(e['exercise_id'],0 if e['bodyweight'] else random.choice([20,30,40,50,60]))
      wkg=0 if e['bodyweight'] else b+2.5*w
      for s in range(1,e['sets']+1):
        t+=dt.timedelta(minutes=2)
        reps=random.randint(e['reps_low'],e['reps_high'])
        c.execute('insert into sets(session_id,exercise_id,exercise_name,set_number,reps,weight_kg,logged_at,profile_id) values(?,?,?,?,?,?,?,1)',(sid,e['exercise_id'],e['name'],s,reps,wkg,t.isoformat(sep=' ')))
    n+=1
c.execute("UPDATE profiles SET password_hash=? WHERE id=1", (main.hash_password(os.environ.get('UX_PASS', 'correct horse battery')),))
c.commit(); print(n, 'sessions seeded for', days)
