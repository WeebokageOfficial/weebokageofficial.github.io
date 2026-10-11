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
