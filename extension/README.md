# Closer reply drafter (Chrome extension, unpacked)

Reads the newest buyer message in an open chat thread, asks your Closer backend for a reply, and puts the
reply in the message box as a **draft**. You press send. Auto-send exists but is **off by default**.

This is an independent tool. It is not affiliated with, endorsed by, or an integration with Facebook or Meta.

## Load it

1. Chrome, `chrome://extensions`, turn on Developer mode.
2. Load unpacked, pick this `extension/` folder.

## Pair it

1. Run Closer (`CLOSER_NO_DELAY=1 APP_URL=http://localhost:3100 npx next dev -p 3100`) and log in to `/dashboard`.
2. Under "Pair a browser extension", create a token and copy it. It is shown once.
3. Click the extension icon, paste the token, enter the listing slug (the part after `/l/`), Save.

The extension only ever holds this token. It never sees your seller password and never logs in as you. The token
is sent in the body of a POST to `/api/extension/reply`, never in a URL. "Forget token" removes it locally;
revoke it server-side by setting `revokedAt` on its `SellerToken` row (there is no revoke UI yet).

## Try it without Facebook

Open `http://localhost:3100/demo/marketplace` (add `?listing=standing-desk` for another item). Type as the buyer in
the "send as buyer" box. The reply appears in the seller message box. Press Send yourself.

## Known limitations

- Facebook selectors in `selectors.js` are unverified guesses and are expected to break. Fix that one file.
  Which side a message is on is guessed from its position on screen.
- Facebook is a single-page app: after navigating into a chat, reload the page so the content script runs.
- One listing slug for the whole browser, not per thread. Change it in the popup when you switch threads.
- Only the loaded part of a thread is read. Identical repeated messages at the same position can be treated as one.
- Facebook inserts text through a rich-text editor; insertion may fail there. The suggested reply is then shown in
  the on-page badge instead of being lost.
- Pointing at a deployed Closer: add its origin to `host_permissions` (as `https://your-app/*`) and to the
  `content_scripts` `matches` (`https://your-app/demo/marketplace*`) in `manifest.json`, reload the extension, then
  set "Closer URL" in the popup. Origins not in `host_permissions` are refused so the token cannot go elsewhere.
- Loading as an unpacked extension in a real Chrome profile, and anything on facebook.com, has not been tested yet. The
  mock page flow was exercised headless with a stubbed `chrome` API running these same source files.
