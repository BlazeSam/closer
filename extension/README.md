# Closer reply drafter (Chrome extension, unpacked)

Reads the newest buyer message in an open chat thread, asks your Closer backend for a reply, and puts the
reply in the message box as a **draft**. You press send. Auto-send exists but is **off by default**.

This is an independent tool. It is not affiliated with, endorsed by, or an integration with Facebook, Meta or Kijiji.

## Load it

1. Chrome, `chrome://extensions`, turn on Developer mode.
2. Load unpacked, pick this `extension/` folder.

## Pair it

1. Log in to `/dashboard` on the deployed app, `https://closer-9a91.onrender.com` (the popup's default "Closer URL"). To use a local copy instead (`CLOSER_NO_DELAY=1 APP_URL=http://localhost:3100 npx next dev -p 3100`), type `http://localhost:3100` in the popup.
2. Under "Pair a browser extension", create a token and copy it. It is shown once.
3. Click the extension icon, paste the token, enter the listing slug (the part after `/l/`), Save.

The extension only ever holds this token. It never sees your seller password and never logs in as you. The token
is sent in the body of a POST to `/api/extension/reply`, never in a URL. "Forget token" removes it locally;
revoke it server-side by setting `revokedAt` on its `SellerToken` row (there is no revoke UI yet).

## Try it without Facebook or Kijiji

Open `https://closer-9a91.onrender.com/demo/marketplace` (or `http://localhost:3100/demo/marketplace` locally) (add `?listing=standing-desk` for another item). Type as the buyer in
the "send as buyer" box. The reply appears in the seller message box. Press Send yourself.

## Kijiji

Runs on `https://www.kijiji.ca/m-msg-my-messages/*` only (the narrowest pattern that covers the messaging inbox; the
rest of kijiji.ca is never touched). Channel is sent as `KIJIJI`. Open a conversation from the inbox and reload the
page so the content script runs. Log in to Kijiji yourself; the extension never handles Kijiji credentials.

## Known limitations

- Kijiji selectors (`CLOSER_KIJIJI` in `selectors.js`) are unverified guesses written without a Kijiji login. Expect to
  adjust them: thread id, message list, composer and send button may all need fixing.
- Facebook selectors in `selectors.js` are unverified guesses and are expected to break. Fix that one file.
  Which side a message is on is guessed from its position on screen.
- Facebook is a single-page app: after navigating into a chat, reload the page so the content script runs.
- One listing slug for the whole browser, not per thread. Change it in the popup when you switch threads.
- Only the loaded part of a thread is read. Identical repeated messages at the same position can be treated as one.
- Facebook inserts text through a rich-text editor; insertion may fail there. The suggested reply is then shown in
  the on-page badge instead of being lost.
- Pointing at another deployed Closer (the Render app above is already allowed): add its origin to `host_permissions` (as `https://your-app/*`) and to the
  `content_scripts` `matches` (`https://your-app/demo/marketplace*`) in `manifest.json`, reload the extension, then
  set "Closer URL" in the popup. Origins not in `host_permissions` are refused so the token cannot go elsewhere.
- Loading as an unpacked extension in a real Chrome profile, and anything on facebook.com or kijiji.ca, has not been tested yet. The
  mock page flow was exercised headless with a stubbed `chrome` API running these same source files.
