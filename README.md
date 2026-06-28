# Gym Tracker — Pi Deployment

Mobile-first workout tracker: logs sets/reps/weight, tracks progress, shows form cues for your 4-day Upper/Lower split.

## Stack
- **Backend**: Python FastAPI + SQLite (ARM64 compatible)
- **Frontend**: React + Tailwind + Recharts
- **Deploy**: Single Docker container — **built off-device, pulled & run on the Pi**

> **Don't build on the Pi.** A 1 GB Raspberry Pi can't compile the React/Vite
> frontend without thrashing swap (and starving anything else it's running, like
> Home Assistant). Build the image on a beefier machine, push it to a registry,
> and have the Pi only ever *pull* the finished image.

---

## 1. Build the image (on the Mac / a beefy machine)

Apple Silicon is `arm64`, the same architecture as the Pi, so it builds the
Pi's image natively and fast:

```bash
# from the repo root
docker buildx build --platform linux/arm64 \
  -t kapekost/workout-tracker:latest --load .
```

## 2. Send it to the Pi (no registry needed)

Stream the built image straight to the Pi over SSH and load it there:

```bash
docker save kapekost/workout-tracker:latest | gzip | \
  ssh kapekost@YOUR_PI_IP 'gunzip | docker load'
```

No Docker Hub, no login, no tokens — the Pi just receives the finished image.

## 3. Run it on the Raspberry Pi (never builds, never pulls)

```bash
ssh kapekost@YOUR_PI_IP
cd ~/workout-tracker
git pull                       # get the latest docker-compose.yml
docker compose up -d           # run the loaded image (no build, no pull)
```

App is now at `http://YOUR_PI_IP:8080` on your home network.

Your workout data lives in `~/workout-tracker/data/workouts.db` — back this file up.

---

## 4. Access from your phone at the gym (Tailscale VPN)

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
Open your phone browser → `http://100.x.x.x:8080` (your Pi's Tailscale IP)

---

## 5. Updates

After changing the app, rebuild on the Mac, stream it to the Pi, and restart:

```bash
# On the Mac — rebuild and send
docker buildx build --platform linux/arm64 -t kapekost/workout-tracker:latest --load .
docker save kapekost/workout-tracker:latest | gzip | \
  ssh kapekost@YOUR_PI_IP 'gunzip | docker load'

# On the Pi — restart onto the new image
cd ~/workout-tracker && docker compose up -d
```

Data persists across updates (stored in the `./data/` volume).

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
