# ExerciseDB GIF proxy on Netlify

## File placement
```
/index.html
/audio/
/netlify.toml                    <- new
/netlify/functions/gif.js        <- new
```
No npm packages needed (Node 18+, Netlify's default). Don't rename the `netlify/functions` folder.

## Deploy
- **Git:** commit the files, push, and Netlify redeploys automatically.
- **Drag & drop:** Netlify's drag-and-drop deploy does NOT build functions from a plain folder drop. Use Git, or the Netlify CLI (`npm i -g netlify-cli`, then `netlify deploy --prod`).

## Verify
1. Open `https://YOUR-SITE.netlify.app/api/gif?exercise=lunge&q=lunge` in the browser.
   Expected: `{"url":"https://static.exercisedb.dev/media/....gif","name":"..."}`
   - `{"error":"notfound"}` -> the function works, ExerciseDB has no match for that term.
   - `{"error":"upstream"}` -> ExerciseDB itself was unreachable or errored (see logs below).
   - `{"error":"ratelimit"}` -> ExerciseDB free-tier limit; wait a minute.
   - HTML / 404 page -> the function wasn't deployed (check folder path, netlify.toml, or redeploy via Git/CLI).
2. Netlify dashboard -> **Logs -> Functions -> gif**. Each call logs lines beginning `[gif]` (upstream status, candidates, chosen exercise).
3. In the app: Settings -> turn on **Debug API**, open an exercise, and read the Console (`[ExDB]` lines).

## How it works in the app
Order per exercise: 30-day cache -> `/api/gif` -> `exercises/{key}.gif` (optional local file) -> hide.
If the GIF host blocks hotlinking, the app retries through `/api/gif?...&raw=1`, which streams the GIF bytes via your function.
The English search term is sent by the app (`q=`), so the function needs no exercise list.

Notes: opening `index.html` from your phone's files (`file://`) can't reach the function; use the deployed site URL.
