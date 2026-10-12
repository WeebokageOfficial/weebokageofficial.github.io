# Local chat presentation dependencies

Pinned local copies ensure Markdown and highlighting work without a CDN request:

- Marked 18.1.1 — https://github.com/markedjs/marked (MIT; marked-LICENSE.txt)
- DOMPurify 3.4.17 — https://github.com/cure53/DOMPurify (Apache-2.0 or MPL-2.0; DOMPurify-LICENSE.txt)
- highlight.js 11.11.1 — https://github.com/highlightjs/highlight.js (BSD-3-Clause; highlight-LICENSE.txt)

AI responses pass through DOMPurify with an explicit tag/attribute allowlist before
insertion. Highlighting is presentation only. Missing libraries fall back to plain
text; the API transport remains in chat.js / site.js.
