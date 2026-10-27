# Weebokage

Static GitHub Pages frontend with a FastAPI backend hosted separately on Render.

## Quick local frontend test

The frontend can use the existing Render API. Start a static server from the repository root:

~~~sh
python3 -m http.server 5500 --bind 127.0.0.1
~~~

Open `http://127.0.0.1:5500/`. VS Code Live Server on port 5501 is supported as well.

Do not open the HTML files directly with `file://`. Firebase, fonts, games and external APIs still require internet access. Add `localhost` and `127.0.0.1` to the permitted Firebase Authentication domains or Google Cloud API referrers when those restrictions are enabled.

## Full local frontend and backend

Create an isolated environment and install the pinned dependencies:

~~~sh
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements.txt
cp .env.example .env
~~~

Fill in `.env`. `ADMIN_UID` must be the UID of the Firebase account that is allowed to receive verified owner status. Use a newly issued Hadith API key because the previous one was exposed in repository history.
The Drive and transit URLs are loaded from the authenticated backend and must also be configured there; they are intentionally absent from the static HTML.

Start the API:

~~~sh
python3 main.py
~~~

Start the frontend in another terminal:

~~~sh
python3 -m http.server 5500 --bind 127.0.0.1
~~~

Open `http://127.0.0.1:5500/?backend=local`. This selection is saved in local storage. To switch back to Render, open `http://127.0.0.1:5500/?backend=remote`.

The API health check is available at `http://127.0.0.1:10000/health`.

## Firebase security rules

`firestore.rules` permits public reads for posts/comments, validated guest comment creation, and authenticated post management. Deploy after reviewing:

~~~sh
firebase deploy --only firestore:rules
~~~

Keep public account registration disabled if every signed-in Firebase user should be considered an administrator.

## Before publishing

1. Deploy the updated backend and configure all variables from `.env.example` in Render.
2. Check `/health` and test chat, anime and the protected Hadith endpoint.
3. Deploy the reviewed Firestore rules.
4. Test the frontend locally with `?backend=remote`.
5. In GitHub Pages settings, enable **Enforce HTTPS**.
6. Verify Google Drive folder permissions; a URL in static HTML is not access control.
7. Publish the frontend only after explicit approval.


## API diagnostics and fixes

The browser uses `site.js: apiFetch`; `chat.js` calls `POST /chat`, and the inline
scripts in `anime.html` call `GET /anime-proxy?search=...` and
`GET /anime-detail/{mal_id}`. `transit.html` calls `GET /admin/config` with a
Firebase ID token. There is no axios dependency or TypeScript in this checkout.
The remaining direct fetch calls in `transit.html` (weather) and `islam.html`
(prayer times) are separate integrations.

All three main integrations already use the FastAPI backend as a proxy:

```text
Browser -> Render FastAPI -> Groq / Jikan
Browser -> Render /admin/config -> protected VRS widget URLs -> iframe
```

Do not put the Groq key in browser code. LangChain supplies Groq's Bearer header
and chat completion payload server-side. Jikan v4 needs no API key; search uses
`q` and returns a `data` array, which the backend unwraps. The frontend chat
payload is `{message, theme, session_id}`; this is our backend contract, not the
Groq wire format.

Live checks on 2026-10-11 returned:

- `/health`: 200, `chat_configured: true`, `admin_verification_configured: false`.
- `/admin/config`: 503, `Admin verification is not configured.`
- `/anime-proxy`: 502, `Anime service unavailable.` The deployed response hides
  the upstream status, so the precise provider failure needs backend logs.
- `/chat` preflight: 200 for `https://weebokage.com`; 400 for
  `https://www.weebokage.com`. The local CORS configuration now allows both.

Set `ADMIN_UID` in Render to the UID from Firebase Authentication and configure
valid `TRANSIT_*_URL` values. An authenticated account with a different UID
correctly receives 403. A present Groq key does not establish that it is valid
or that the configured model is permitted.

The frontend now displays backend error details and permits 65 seconds for
Render startup. Public anime reads omit unnecessary Firebase authentication.
Backend GET requests retry transient errors twice; chat requests are not
retried. An upstream Jikan 403 is identified separately from user permissions.
Retries cannot repair a persistent provider block.

A VRS iframe failure is separate from fetch/CORS: verify the widget URL and
inspect its response plus `X-Frame-Options` / CSP `frame-ancestors`. Each widget
now has a direct link. If the provider forbids embedding, use its supported
widget or a documented departures API with server-side access; adding CORS
headers to an HTML proxy does not resolve that restriction.

Deploy the changed backend and frontend for these fixes to take effect.
No hosting configuration or secrets are changed by the local edits.

Regression checks (requires `httpx` in the development environment):

```sh
python -m unittest discover -s tests -q
```

Specification references: [Groq API](https://console.groq.com/docs/api-reference),
[Jikan v4](https://docs.api.jikan.moe/).

## Anime provider migration

The backend now defaults to `https://api.tenrai.org/v1`, which uses the Jikan-compatible
response format. The previous Jikan host failed with connection errors in Render logs.
Set `ANIME_API_BASE` in Render to override the provider, including its version path,
then redeploy the updated backend. Search, details, characters, and the chat anime tool
all use this setting. No anime API secret is needed for public access.

Provider documentation: https://api.tenrai.org/documentation

## LifeOS

`lifeos.html`, `lifeos.css`, and `lifeos.js` provide the English dashboard. Existing
`weebokage.lifeos.v1` browser data is retained, including migration of legacy German
category labels. Changes save automatically on this device; a rolling local backup
can recover a damaged primary record. Export/restore JSON backups to move progress
between browsers/devices. This is local storage, not account-based cloud sync.

The splash screen closes automatically or via Enter LifeOS. Companion bubbles call
`POST /lifeos/quote` through Render using `GROQ_API_KEY` and `GROQ_MODEL`. Each tab
has its own prompt and local fallback; Imam uses respectful Islamic expressions.
Generated companion lines are separate from the sourced, curated hadith card.

Lore PDF import calls `POST /lifeos/lore-import?filename=...` with raw PDF bytes and
`Content-Type: application/pdf`. It requires the Firebase owner identified by
`ADMIN_UID`. The PDF text is sent to Groq for categorisation; neither the original
PDF nor its text is persisted by the backend. Up to three files can be selected in
the UI, processed sequentially, each at most 5 MB, 40 pages and 60,000 extracted
characters. Scans need OCR first; pages without readable text are reported.
Extracted notes include source filename/page references and must be reviewed before
being saved as drafts in the browser archive. Closing review saves nothing.

Deploy the updated backend with the updated `requirements.txt` (including pypdf)
and publish the updated frontend together. No additional API key is needed. If the
new endpoints are not deployed or Groq is unavailable, companion bubbles use local
lines and the dashboard remains usable; PDF import displays the backend error.

LifeOS is installable over HTTPS (or localhost) through `manifest.json` and `sw.js`.
The first online visit caches the dashboard, shared JS, wallpaper, icons and all
five sprites. Later offline launches retain local progress, tools and cached prayer
times; AI speech and PDF analysis still require a connection. Only explicitly
listed static LifeOS assets are cached, never API responses or uploaded PDFs.
Bump `lifeos-shell-v1` in `sw.js` when releasing changed shell assets.

Companion prompts include local time of day, activity streak and yesterday’s saved
open-quest count. Local fallback lines use the same context. Web Audio synthesises
completion blips and level-up arpeggios; the mute preference persists in the save.
Rank titles change at levels 3, 6 and 10, with a title-unlock announcement.

The Imam tab loads today and tomorrow from Aladhan, defaulting to Cologne/Germany,
Muslim World League (method 3). City/country and calculation method are editable;
Use my location requests browser geolocation explicitly. Returned timezone-aware
timestamps drive the next-prayer countdown, including tomorrow’s Fajr after Isha.
Schedules and manual overrides are saved locally. Each daily prayer awards 20 XP
once; older checked prayers are treated as already rewarded during migration.
Prayer times depend on the calculation method; match your local mosque as needed.

Export downloads `lifeos_backup.json`, containing all LifeOS state, including sound,
prayer settings, notes, finance entries and progress (other website storage is not
exported). Import validates before replacing progress and retains a rolling backup.

## Global CyberDeck and command shell

Every HTML entry point loads `global-bootstrap.js`. It opens the persistent
`lifeos-shell.html` and keeps the requested page URL in the address bar. Internal
navigation, Back/Forward and game-page reloads replace only the content iframe;
the Spotify SDK device, terminal history and working directory stay alive.
Opening a new tab or reloading the entire browser document creates a new SDK session.

`global-ui.js` contains `SPOTIFY_CLIENT_ID`. Register the exact HTTPS
`https://weebokage.com/lifeos.html` callback in the Spotify Developer Dashboard
(and the matching `127.0.0.1` URL/port for local development). All pages use this
single PKCE callback. Spotify credentials stay outside LifeOS JSON exports.

The console opens with `^`, `~`, Escape outside text inputs, or **>_ KONSOLE**.
Run `help` or `man quest`. It is a browser shell with a virtual filesystem:
LifeOS records are readable in `~/quests`, `~/habits`, `~/lore` and `~/vault`;
`~/tmp` stores writable scratch files locally. It does not execute host OS commands.

```sh
quest add --xp 75 --priority high "Write chapter 3"
quest ls | grep -i chapter
quest done 3
cd ~/lore
ls -lah
cat *.md | head -n 20
echo "$USER at $PWD" > ~/tmp/session.txt
false || echo "exit status: $?"
music volume 35
music next
```

Tab completes commands, file paths and record IDs. History supports ↑/↓,
Ctrl-R, `!!` and `!N`; Ctrl-L clears, Ctrl-C cancels input/effects, and Ctrl-D
closes an empty prompt. Quoted strings, variables, globs, pipes, conditional
chains and output redirection are supported. Commands share the same validated
LifeOS save format and XP reward rules on every page.

Run the shell regression tests with Node.js:

```sh
node --test tests/terminal.test.cjs
```

## Holographic 3D Dimension Scanner

Open **Scanner** in the navigation or the LifeOS header (`scanner.html`). The
scanner shares the persistent CyberDeck and console. Three.js and OrbitControls
use the same pinned `0.180.0` CDN release through an import map; no build step is
required. Geographic data is local (`assets/scanner/earth-land.json`), derived
from Natural Earth's public-domain 1:110m land dataset.

Drag to orbit, scroll or pinch to zoom, and select a buoy or directory entry.
The camera flies toward the chosen signal while the globe rotates it into view.
Filters control both the directory and raycasting; markers behind the sphere
cannot be selected through it. Closing the details restores the overview and
previous auto-rotation setting. Reduced-motion preferences disable default
rotation, animation and camera transitions.

`scanner-model.js` contains the six `scannerLocations` and the pure geographic
projection; `scanner.js` wraps the projection in `latLonToVector3`. North is +Y,
Greenwich is +Z and 90° east is +X. Weather and altitude readings are explicitly
simulated; local time uses each real node's timezone. Selecting a fictional rift
does not change your save. **Save to Lore Graph & Open** creates its
missing graph record, preserves existing notes and opens that exact record.

The renderer caps pixel density, batches land/stars/contours and pauses when the
page is hidden. Page disposal aborts fetches/listeners, stops animation and clock
timers, disconnects resize observers and releases geometries, materials, textures,
controls and the WebGL context. If CDN loading or WebGL fails, the signal directory
and HUD remain usable. The service worker caches local scanner assets; the first
3D load still requires access to the Three.js CDN.

```sh
node --test tests/scanner.test.cjs tests/terminal.test.cjs
```

## Shared LifeOS design system

All eleven content pages use `theme.css` for colors, Inter / JetBrains Mono
font stacks, surfaces, focus states, shared navigation, footer and responsive
layouts. `style.css` supplies archive layout primitives, `responsive.css`
accessibility helpers, and `pages.css` the extracted module layouts and reusable
layout utilities. LifeOS and the scanner keep their feature-specific styles.
The persistent shell also loads the same tokens for its music deck and console.

`chrome.js` manages the accessible hamburger menu and Miku / Teto switch. Themes
persist through the existing shared LifeOS state without changing the selected
LifeOS module. The navigation groups Entertainment, Workspace, Music and About, with a standalone
Shop link and LifeOS at the end. Category menus contain no character sprites.
Protected pages still require their existing Firebase session.

`chat.html` is the full Neural Synapse interface. Both this screen and existing
chat widgets use the same `/chat` request, Firebase auth, backend selection and
session ID. `chat.js` renders replies with the pinned local libraries described
in `assets/vendor/README.md`, including sanitized Markdown and code highlighting.
Duplicate sends are suppressed while a request is pending; Shift+Enter inserts a
newline. Anime format filters and sorting apply to the currently returned API
results, retaining the existing search and detail endpoints.

UI regression checks use mocked Firebase, API responses and transit embeds (no
live writes). Start a local static server and run:

```sh
python -m http.server 8765
# In another terminal, with Playwright and Chromium installed:
python tests/ui_smoke.py
```

Set `UI_BASE_URL` to test another local server and `UI_ARTIFACT_DIR` to choose
where desktop/mobile screenshots are saved (default `/tmp/weebokage-ui`). The
suite covers every content page at desktop/mobile sizes, compact 320px and 768px
layouts, LifeOS tabs, theme persistence, navigation, guestbook submission, anime
filters/detail/error states, protected transit views, login rejection and safe
Markdown/code rendering. Scanner 3D behavior has its own model tests; this UI
suite deliberately blocks its CDN to exercise the accessible fallback.

## Cyber diagnostics, holograms and Breach Protocol

`diagnostics.js` runs once in the persistent shell and displays the compact
`#cyber-diagnostics-bar` on every route. It requests the configured backend’s
`/health` every 30 seconds with a 10-second timeout. RTT below 150ms is green,
150–500ms yellow, and above 500ms or request/health failures red. Battery and
network values come from supported browser APIs; unsupported battery reporting
uses the requested `PWR: AC // OK` label (its tooltip explains the fallback), and
unknown network types are reported as unknown. Local and Tokyo clocks use Intl.
Polling pauses while hidden; timers, listeners and requests clean up on unload.

`holograms.js` enhances LifeOS companion quotes and Imam hadith cards with
VanillaTilt 1.8.1 from cdnjs, pointer-driven holographic sheen and a Copy Quote
button. Copies include the displayed source; successful copies play a short tone
through the existing shell AudioContext. Reduced-motion preferences disable tilt
and gyroscope animation. If the CDN fails, the card and clipboard still work.
Dynamic cards destroy old tilt instances/listeners when their tab is re-rendered.

Open **Breach Terminal** in Lifestyle or run `arcade` / `arcade breach` in the
console on any page. `breach-model.js` contains the pure rules; `arcade.js` owns
one native dialog. Boards always contain a valid top-row → column → row solution,
cells cannot be reused, and the 30-second deadline is absolute. Successful rounds
award 40 XP with the shared level-up formula. Up to three rounds per local day
award XP; further rounds are practice. `breachRewards` stores round IDs and the
last success timestamp in the same localStorage profile transaction as XP, so
reloads, navigation and compatible backups preserve the limit. Web Locks serialize
concurrent game reward claims where supported. Failed saves do not report XP
as granted. New effects respect the saved mute preference.

Shared visuals live in `cyber-modules.css`. The PWA caches the local modules;
external tilt loading is optional. Run:

```sh
node --test tests/cyber-modules.test.cjs tests/scanner.test.cjs tests/terminal.test.cjs
python tests/cyber_modules_ui.py
```

The Playwright suite uses the same local server/mock setup as `tests/ui_smoke.py`
and downloads/caches the pinned tilt library in the system temporary directory.
It covers telemetry thresholds/failures, battery events, real tilt initialization,
clipboard contents, remount cleanup, modal/CLI launch, XP/level-up, daily limits,
practice, timeout, invalid buffers and a complete touch round at 320px width.

### Public VocaDB stream

`vocadb.html` is a public page in the persistent shell, with a matching Song of
the Day widget in LifeOS. No account, API key or backend proxy is needed.

- `vocaloid random` chooses from 50 top-rated tracks; `vocaloid find QUERY`
  prints the top three matches. Song of the Day caches its selection for 24 hours
  in `vocadb_daily_cache`; reroll excludes the current song where possible.
- API results use a bounded local cache (`weebokage.streams.cache.v1`), limited
  to 500,000 characters. Requests time out after 12 seconds.
- Cyber-Dex, daily encounters, catch rewards and the `dex` terminal command have
  been removed. Older collection data remains readable in LifeOS backups.
  Legacy `pokemon.html` bookmarks redirect to LifeOS.

Implementation: `data-streams.js`, `streams-ui.js`, and `data-streams.css`.
Validation: `node --test tests/data-streams.test.cjs` and
`python tests/data_streams_ui.py` against a local server. Browser tests mock
external services.

### Shared navigation

All content pages share Home and grouped Entertainment, Workspace, Music, and About menus, plus a standalone
Shop link that always opens its entrance. Workspace includes the Terminal. LifeOS is a separate link at the end, followed by the Miku/Teto theme switch. `theme.css` styles both desktop
and mobile; `chrome.js` handles focus containment, Escape, outside clicks and
responsive changes. Account/private links retain their existing auth IDs.

### Teto AI mini tools

The **Teto Tools** tab now includes Roast & Refactor (three styles), Brain-Dump
→ Quest Converter, Prompt Overclocker (code/image/writing), and Lore & Logic
Scanner. The existing word counter and unit converter remain below the AI grid.
Inputs and results survive LifeOS tab changes within the page session; raw text
is not persisted. Only explicitly accepted quest drafts enter the shared LifeOS
profile, with their category and 15–50 XP. Importing a quest does not award XP.
Repeated imports of the same draft/title are ignored.

`callTetoAI(systemPrompt, userText, {tool, onStatus})` in `lifeos.js` sends a
stateless POST to `/lifeos/teto-ai`. `teto_ai.py` uses the existing Render
`GROQ_API_KEY` / `GROQ_MODEL` configuration and the plain Groq model without
chat history or privileged tools. Server and browser both validate the JSON
output. Story percentages are editorial AI estimates; higher pacing scores
indicate more tension, while higher plothole/cliché scores indicate more issues.

Network/temporary service failures receive one automatic retry after a visible
10-second countdown. Configuration, API-key, quota, invalid-output and missing
endpoint errors instead explain the necessary fix. Deploy the updated FastAPI
backend together with the frontend. The Groq API key stays server-side.

Groq [retired regular-tier Llama 3.1 access on August 16, 2026](https://console.groq.com/docs/deprecations).
The existing default is the recommended `openai/gpt-oss-20b` replacement. An
eligible enterprise deployment can choose Llama through `GROQ_MODEL`.

Checks: `python -m unittest discover -s tests -p 'test_*.py'` and
`python tests/teto_tools_ui.py` (Playwright, local server, mocked Groq/Firebase).

The Teto suite also includes three specialized workbenches:

- **Decision Matrix:** enter A/B and optionally C with context. Teto chooses one
  submitted label, explains why, and supplies a concrete work order with a
  1–120 minute timebox. Output refers to the submitted snapshot even if you edit
  an option during the request.
- **Techno-Jargon:** choose cyberware, ordnance, software, propulsion or biotech.
  The API returns exactly five unique fictional specifications. Copy Spec
  includes name, acronym and description with shared audio feedback.
- **Dialogue & Fight Choreographer:** provide two characters/stances, scene
  intent, and verbal/CQC/neural mode. Structured beats carry BURST, TEMPO SHIFT
  and CLIMAX tags. Save to Lore writes a Chapter Notes draft to the shared
  profile and prevents duplicate saves of the same generated scene. Scene size
  is constrained to the existing Lore note limit; saving awards no XP.

`handleDecisionMatrix()`, `handleJargonGenerator()` and `handleChoreographer()`
in `lifeos.js` dispatch through the same stateless Teto API. New request types
validate their structured inputs and outputs in both the backend and browser.
The specialized tools use trajectory loading feedback and shared submit/success
blips. Update the Render backend with the expanded `teto_ai.py` alongside the
frontend. Browser validation: `python tests/teto_specialized_ui.py`.

### On-demand music player

Open Music → Music player for the full Spotify controls. The player stays
hidden on normal visits and reserves no page space. After playback starts from
a listening session, closing Music leaves a small persistent player with its
equipped sprite and bop animation. Pausing keeps the mini player available for
resume; disconnecting hides it. The full and mini views share the same SDK
instance and DOM controls, so navigation never restarts playback.

### Artwork organization

See [assets/README.md](assets/README.md) for the image folder map and the source
files that reference each group. Shop product art is independent from the free
player dancers and the theme splash images. Existing product IDs are unchanged.

### Homepage and private archive

The home page presents the operator and interests. Guestbook messages live at `guestbook.html`. The WCU archive is reserved for the verified administrator; its stories, dossiers, and book details are not embedded in public assets.

Add your personal homepage profile at `assets/profile/profile.png`. It is independent of Miku/Teto themes. Keep confidential book artwork outside public hosting.

See [WCU_DATA.md](WCU_DATA.md) for owner setup, protected Firestore storage, importing the private backup, and editing archive records. Deploy the updated Firestore rules and website together to apply the restrictions.
