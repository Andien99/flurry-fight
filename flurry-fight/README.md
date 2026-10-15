# Flurry Fight

A live classroom snowball-fight quiz game, in the spirit of Gimkit's Snowbrawl. Students join on their own devices with a 6-digit code, answer questions to make snowballs, and throw them at each other in a top-down snowy arena. The player (or team) with the most knockouts when time runs out wins.

## How a game runs

1. **Teacher** opens `/host.html`, picks or builds a question set, chooses options and clicks **Create game**.
2. The lobby shows a big join code, the site address and a QR code. **Students** go to the site, type the code and their name, and pick a colour.
3. Click **Start game**. Students switch between two modes:
   - **Answer questions** (key `1`): every correct answer adds snowballs (3 by default). Wrong answers show the correct answer and pause briefly so guessing doesn't pay. Every 5 in a row gives 2 bonus snowballs.
   - **Throw** (key `2`, or just click the map): aim with the mouse, click or hold to throw. Space also throws.
   - Move with WASD or the arrow keys at any time, including while answering.
4. A snowball does 25 damage. Shields soak up damage first. At 0 health you're knocked out and respawn 3 seconds later with 2 seconds of protection.
5. **Hiding:** walk into a pine grove or an igloo and you disappear from enemies' screens (the canopy fades so you can still see yourself, and a "Hidden" badge appears). Enemies who get within a short distance can see you, and throwing a snowball or getting hit gives your spot away for about a second. Teammates can always see each other, and the teacher's live view shows everyone. Snow mounds, crates, ice blocks, logs, snowmen and the fence block both players and snowballs, so you can also take cover behind them.
6. **Frozen ponds** are slippery: you keep sliding after you let go of the keys.
7. Power-ups appear on the map: **Shield Can** (+50 shield), **Hot Cocoa** (+50 health), **Snow Pile** (+5 snowballs).
8. When time's up (or you click **End game**) you get a results page with every student's knockouts and accuracy, plus a list of questions ordered hardest first. **Download results (CSV)** saves it for your markbook.

Tablets and phones work too: drag on the left side of the map to move, tap anywhere else to throw at that spot.

## Game options

| Option | Choices |
|---|---|
| Length | 2–15 minutes |
| Mode | Free for all, or two teams (blue vs red, auto-balanced, no friendly fire) |
| Snowballs per correct answer | 1–10 (bag holds 30) |
| Pause after a wrong answer | none to 5 seconds |
| Late joining | allowed or locked once the game starts |
| Power-ups | on or off |

## Question sets

Sets are saved in the teacher's browser (use **Export** to keep a `.json` copy or move it to another computer). **Starter sets** adds ready-made sets, including *Year 7 Algebra: pre-test skills* (52 questions across the 9 skills of the Year 7 Algebra pre-test).

There are four ways to add questions:

- **Write a question.** Type the question (maths buttons insert fractions, powers, roots and symbols; a live preview shows exactly what students see). Choose *Pick from options* (type the correct answer, then wrong answers, or click **Suggest wrong answers** to fill them from common mistakes) or *Type the answer* (with a **Test it** box to check what will be marked right). Add an optional skill. Press **Ctrl + Enter** to add it and start the next one.
- **Generate from skills.** Tick skills (Year 7 Algebra or Number), choose how many per skill, Core or Stretch, and options/typed/mix. Every question gets fresh numbers and wrong options built from common mistakes.
- **Upload a file.** Word (.docx, including Word equations), PDF, Excel (.xlsx), CSV, text or a Flurry Fight export. Numbered questions, A–E options and (a) (b) parts are picked up automatically. Tests usually don't include answers, so those questions are marked *Needs an answer*: click the correct option, or type the answer, right in the list. Questions that mention a table, diagram or picture are flagged for checking. **Download the question template** gives a spreadsheet layout (question, correct answer, wrong answers, skill) to fill in and upload.
- **Paste a list.** One question per line, parts separated by `|` or a tab (straight from a spreadsheet), correct answer first.

Each question in the list can be edited, moved, copied or deleted (with undo).

**How typed answers are marked.** Spacing, capitals, term order (`6 + 8k` = `8k + 6`), letter order (`ba` = `ab`), equal numbers (`1/2` = `0.5`), and a leading `x =`, a `$` or a unit (`26 cm`) are all accepted. Unsimplified answers (`3k + 5k` for `8k`), unexpanded brackets when the answer is expanded, and `×` or `÷` when the answer has none are marked wrong.

**Results by skill.** When questions have skills, the results page lists skills from weakest to strongest with the class's accuracy, and the CSV includes a skill summary.

## Run it on your own computer

You need [Node.js](https://nodejs.org) 18 or newer.

```
npm install
npm start
```

Open http://localhost:3000/host.html. Students on the same network can join at `http://YOUR-COMPUTER-IP:3000`. School networks often block this, which is why hosting it online (below) is usually easier.

## Put it online (free, on Render)

1. Create a free GitHub account and a new repository, then upload this whole folder to it (everything except `node_modules`).
2. Create a free account at [render.com](https://render.com) and sign in with GitHub.
3. Click **New → Blueprint**, choose your repository, and click **Apply**. The included `render.yaml` sets everything up (Node web service, free plan, Singapore region for the lowest lag from Australia).
   - Or click **New → Web Service**, pick the repository, and set Build command `npm install` and Start command `npm start`.
4. After a few minutes Render gives you an address like `https://flurry-fight.onrender.com`. Students go there; you go to `/host.html`.

**Free-plan catch:** free Render services go to sleep after a period without visitors and take up to about a minute to wake. Open the host page a couple of minutes before class so it's awake when students arrive.

Any host that runs Node.js and supports WebSockets works the same way (Railway, Fly.io, a school server).

## Good to know

- Games live in the server's memory. Restarting or redeploying the server ends any game in progress. Abandoned games are cleared automatically.
- Up to 60 players per game.
- If a student's laptop drops out or they refresh, they rejoin automatically as the same player with their score intact. The teacher's page also reconnects after a refresh.
- Click × beside a name in the lobby to remove a player.
- The server checks movement speed, ammo, throw rate and answers, so students can't edit their way to more snowballs.

## Files

```
server.js          game server (Express + Socket.IO)
public/index.html  student join + game screen
public/play.js     student game client
public/host.html   teacher screens
public/host.js     teacher client: question editor, lobby, live view, results
public/render.js   map and character drawing (shared by both)
public/sprites.js  vector artwork for the arena (trees, igloos, snowmen, crates, ice…)
public/shared.js   map layout, collision, hiding spots and ponds (shared by server and browser)
public/answers.js  typed-answer marking (shared by server and the question builder)
public/generators.js  skill-based question generators
public/importers.js   reads Word, PDF, Excel, CSV and text files into questions
public/presets.js     starter sets
public/style.css   styles
render.yaml        one-click Render deployment
```
