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
