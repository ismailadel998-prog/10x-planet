# Escape the 10X Planet!

A Grade 4 space-adventure math game for Topic 4, Lesson 4.1: Multiply by Multiples of 10.

- 8 team missions (Team Comets vs Team Rockets), 20-second timer, ship fuel meter
- Final boss: missing-factor challenges from the lesson (40 × ? = 200, ? × 90 = 8,100, 10 × ? = 200, 30 × ? = 2,700, 40 × ? = 3,200)
- Keys: 1–4 or A–D to answer · Enter for next · Esc to pause

## Solo mode (remote classes)
Students open the link, choose their class (or use `/?class=4A`), tap their name and play once.
Results go to a Google Sheet through `apps-script/Code.gs`; the teacher dashboard is at `/teacher` (PIN set in the script).
Class lists are in `src/roster.ts`. Set the Apps Script web app URL in `src/api.ts` or as `VITE_SCRIPT_URL` in Vercel.

## Live games (phones)
From the teacher dashboard: **Team turns** or **Race** opens `/host` for the chosen class. Students open `/join`, type the 6-digit code (or scan the QR) and tap their name.
Needs a free Firebase Realtime Database: put the web config in `src/live/firebaseConfig.ts` and paste `firebase/database.rules.json` into the database's Rules tab.

## Run locally
npm install
npm run dev

## Deploy
Import this repo into Vercel. It detects Vite automatically (build: `npm run build`, output: `dist`).
