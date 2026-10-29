# Fun Friday Bingo 🎉

A small multiplayer Bingo game for GitHub Pages using Firebase Realtime Database and Anonymous Authentication.

## What's included
- Create/join a room with a short code; first player is host.
- Each player can edit a 5×5 card. Numbers 1–25 must appear exactly once.
- Ready/not-ready roster; host can start only when everyone is ready.
- Host's browser automatically calls a unique random number every 3 seconds.
- All players see the same calls and mark called numbers on their own card.
- Five completed lines (rows, columns, or either diagonal) qualify for BINGO.
- Transaction-based first-claim handling, winner podium, and full leaderboard.
- Responsive, colorful party UI.

## 1. Create Firebase project
1. Open https://console.firebase.google.com/ and create a project.
2. In **Build → Realtime Database**, create a database. Choose a region close to your team.
3. Copy the database URL shown in the console.
4. In **Build → Authentication → Sign-in method**, enable **Anonymous**.
5. In **Project settings → General → Your apps**, add a Web app and copy its Firebase config.

## 2. Add your Firebase config
Open `app.js` and replace the placeholder values in `firebaseConfig`:
- `apiKey`
- `authDomain`
- `databaseURL` (use the exact URL shown for your Realtime Database)
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

Firebase web config is not a server secret. Access is controlled by Authentication and Database Rules.

## 3. Set Realtime Database rules
In Firebase Console → Realtime Database → Rules, paste the contents of `database.rules.json` and publish.

**Important prototype limitation:** these easy-to-deploy rules allow any signed-in anonymous player to read/write room data. This is acceptable only for a casual, trusted group where participants are not expected to tamper with the game. Client-side validation is for game flow, not security; a determined user could edit their card/marks or overwrite room state. Do not use this ruleset for a public or competitive game.

For stronger anti-cheat protection, move host/game mutations to a trusted backend (for example Cloud Functions) and use strict rules that permit players to update only their own readiness/card/marks, while the backend validates calls and claims. Firebase App Check can also help reduce abuse.

## 4. Deploy on GitHub Pages
1. Create a GitHub repository, e.g. `fun-friday-bingo`.
2. Upload `index.html`, `styles.css`, `app.js`, and `database.rules.json`.
3. In repository **Settings → Pages**, choose **Deploy from a branch**.
4. Select branch `main`, folder `/ (root)`, then Save.
5. Wait for the Pages URL, usually `https://YOUR-USERNAME.github.io/fun-friday-bingo/`.
6. Open the URL, enter a display name, click **Create a room**, then share the generated room link/code.

GitHub Pages serves static files over HTTPS, which is required for clipboard and Firebase browser features.

## How to host tomorrow
- Create the room from the laptop you will keep open during the game.
- Share the room link with colleagues; they can open it on phones or laptops.
- Ask everyone to edit their card and click Ready.
- The host starts when all joined players are ready.
- Keep the host tab and laptop awake: automatic calls are driven by the host's browser timer. If that tab closes or the laptop sleeps, calls pause until the host returns/reconnects.
- The game calls numbers every 3 seconds; change `},3000);` in `app.js` if you want a different speed.

## Game rules implemented
A valid Bingo claim requires at least five completed lines total, where each line is a complete row, column, or diagonal. The claim is checked again against the player's card and marked numbers in the shared room state. The first successful room transaction wins the game. Remaining players are ranked by claim time, then number of lines, marked numbers, and join time.

## Troubleshooting
- **"Add your Firebase web config…"**: finish step 2 and commit the edited `app.js`.
- **Permission denied**: make sure Anonymous Auth is enabled and the rules were published.
- **Room not found**: check the room code; room codes are uppercase.
- **Calls pause**: the host tab must remain open; refresh/reopen the host room to resume.
- **Nobody can join after start**: expected; this prototype locks joining when the game begins.
- **Players can't see updates**: check database URL and internet access.

## Files
- `index.html` — page structure
- `styles.css` — responsive styling
- `app.js` — Firebase setup and game logic
- `database.rules.json` — starter database rules
