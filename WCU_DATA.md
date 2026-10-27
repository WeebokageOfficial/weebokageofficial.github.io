# Private WCU archive

WCU lore is administrator-only. Public assets contain an empty `WCU_DATABASE`, never a lore snapshot. The home page and scanner do not publish archive details. No archive content is fetched until the signed-in account is verified as the owner.

## Required deployment

1. Deploy the updated `firestore.rules` to Firebase project `weebokage-296c0` (`firebase deploy --only firestore:rules --project weebokage-296c0`, or use the Firebase console).
2. In Firestore document `site_config/access`, set string field `ownerUid` to the owner's Firebase Authentication UID. Use the existing administrator account.
3. Publish the updated website and service worker. The new worker deletes previous shell caches and no longer precaches WCU files.
4. Sign in at `login.html` and open `wcu.html`. Choose **Manage archive → Import backup**, select the privately preserved archive JSON, and choose **Publish changes**. Here, Publish saves to the protected archive; it does not make records public.

The original archive was preserved locally outside the website at `~/.local/share/weebokage/private-wcu/archive.json`. Do not copy it into this repository or an assets folder. Private backup files and confidential book artwork must stay outside public hosting.

Firestore `wcu/active` reads and writes both require the configured owner UID. Ordinary signed-in accounts are denied, as are anonymous requests. The backend owner check can identify the administrator during setup, but it does not bypass Firestore rules.

## Editing

The owner editor supports stories, characters, timelines, casts, connections, sections, quick facts, new records, reference-safe deletion, JSON import, and private backup downloads. Saves are atomic and revision-checked. A conflict preserves the owner's draft instead of overwriting another session.

The private JSON model has `timelines`, `projects`, and `characters` arrays. Use stable unique IDs. Projects reference timelines with `timelineId`, cast members with `characterIds`, and related stories with `connectedProjectIds`. Character appearances are derived automatically. `infobox` values are text; `sections` have a `title` and `content`. Paragraph content accepts a string or an array of strings.

Cross-reference syntax:

- `[[project:example-story]]`
- `[[character:example-character]]`
- `[[character:example-character|Display name]]`

Do not add actual lore, private exports, or confidential covers to `wcu-data.js`, documentation, public test fixtures, or other static files. Use the authenticated editor or import a private JSON backup.

## Privacy behavior

The archive stays locked while verification is pending or unavailable. Signing out removes the rendered dossiers, search indexes, and editor draft, then reloads the archive without the private route. Back/forward-cache restoration requires a fresh verification. No application-level localStorage copy of lore or offline public fallback is created.

Repository tests use synthetic records unrelated to the actual archive. Run `python tests/wcu_privacy_ui.py` and `python tests/wcu_admin_ui.py` against a local static server with Playwright and Chromium available. These tests mock Firebase; deploy the rules before relying on live access restrictions.
