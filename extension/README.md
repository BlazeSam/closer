# Closer reply drafter (Chrome extension, unpacked)

Reads the newest buyer message in an open chat thread, asks your Closer backend for a reply, and puts the
reply in the message box as a **draft**. You press send. Auto-send exists but is **off by default**.

This is an independent tool. It is not affiliated with, endorsed by, or an integration with Facebook, Meta or Kijiji.

## Load it

1. Chrome, `chrome://extensions`, turn on Developer mode.
2. Load unpacked, pick this `extension/` folder.

## Pair it

1. Log in to `/dashboard` on `https://closer-9a91.onrender.com` (or `http://localhost:3100` locally).
2. Click **Connect this browser**. The dashboard mints a token and hands it to `pair.js` (a content script that
   runs only on the dashboard) through a same-origin `postMessage`. You see "This browser is connected".
3. Click the Closer icon and choose which item you are selling from the list. Save.

If the extension is not installed or was loaded before `pair.js` existed, the dashboard shows the token instead:
reload the extension and the dashboard and click again, or paste it under Advanced in the popup.

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

## Add to Closer (import a listing)

On your own Facebook Marketplace listing (`facebook.com/marketplace/item/...` or `facebook.com/commerce/listing/...`)
a button "Add to Closer" appears bottom right. It reads the title, price, condition, description and photo
(read-only) and opens `/sell/new` on Closer filled in. You answer the price questions and save. Verified 11 Nov on a
real listing. Facebook photo links expire, so the imported photo may stop showing after a while.

## Known limitations

- Verified 11 Nov in real Chrome: one-click pairing from the deployed dashboard, and a draft reply landing in the
  message box on the deployed `/demo/marketplace` with the badge "draft ready".
- Facebook: selectors rewritten from a live Messenger Marketplace thread (`[role=log] [data-message-id]
  [aria-roledescription=message]`, label `At <time>, You: <text>`, composer `[role=textbox]`). They read the
  owner's own message as outbound, correctly. On 11 Nov, from the seller account, it read every buyer message correctly
  and drafted replies into the box. That run showed the draft inserted twice; fixed, not yet re-run there. "You" detection is English-UI only. The send button selector is unchecked
  (it only appears once text is typed; auto-send is off anyway).
- Kijiji selectors (`CLOSER_KIJIJI` in `selectors.js`) are still unverified guesses. `id()` no longer falls back to
  `data-testid` (identical on every message, which would have silenced the extension after one reply).
- Facebook is a single-page app: after navigating into a chat, reload the page so the content script runs.
- One item for the whole browser, not per thread. Change it in the popup when you switch threads.
- Only the loaded part of a thread is read. Identical repeated messages at the same position can be treated as one.
- Facebook inserts text through a rich-text editor; insertion may fail there. The suggested reply is then shown in
  the on-page badge instead of being lost.
- Pointing at another deployed Closer (the Render app above is already allowed): add its origin to `host_permissions` (as `https://your-app/*`) and to the
  `content_scripts` `matches` (`https://your-app/demo/marketplace*`) in `manifest.json`, reload the extension, then
  set "Closer URL" in the popup. Origins not in `host_permissions` are refused so the token cannot go elsewhere.
