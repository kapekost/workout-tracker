# Gym Tracker — Pi Deployment

Mobile-first workout tracker: logs sets/reps/weight, tracks progress, shows form cues for your 4-day Upper/Lower split.

## Stack
- **Backend**: Python FastAPI + SQLite (ARM64 compatible)
- **Frontend**: React + Tailwind + Recharts
- **Deploy**: Single Docker container, `docker compose up`

---

## 1. Deploy on Raspberry Pi

```bash
# Copy the project to your Pi
scp -r workout-tracker/ pi@YOUR_PI_IP:~/workout-tracker

# SSH in
ssh pi@YOUR_PI_IP

# Deploy
cd ~/workout-tracker
docker compose up -d --build
```

App is now at `http://YOUR_PI_IP` on your home network.

Your workout data lives in `~/workout-tracker/data/workouts.db` — back this file up.

---

## 2. Access from your phone at the gym (Tailscale VPN)

Tailscale is the easiest zero-config VPN. Free for personal use.

### On the Pi:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
Note the Tailscale IP shown (e.g. `100.x.x.x`)

### On your phone:
- Install **Tailscale** app (iOS/Android)
- Sign in with the same account
- Enable Tailscale

### Access the app at the gym:
Open your phone browser → `http://100.x.x.x` (your Pi's Tailscale IP)

---

## 3. Updates

To update after changing files:
```bash
docker compose up -d --build
```

Data persists across rebuilds (stored in `./data/` volume).

---

## Features
- 📋 4-day Upper/Lower split pre-loaded with form cues
- ⚡ +/- controls for weight (2.5kg steps) and reps
- 🏆 PR detection — highlights new personal records
- 📈 Progress charts per exercise
- 📅 Session history with best sets highlighted
- 🎬 YouTube form demo link per exercise (opens on phone)

## Workout Cycle
Upper A → Lower A → Upper B → Lower B → repeat
