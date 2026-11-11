// Service worker. The ONLY place that talks to the Closer backend, and the only place the token is read.
// The token goes in the POST body, never in a URL.
const DEFAULT_APP_URL = "https://closer-9a91.onrender.com"; // localhost:3100 still works if typed in the popup

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "closer-reply" || sender.id !== chrome.runtime.id || !sender.url) return;
  reply(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true; // async response
});

async function reply({ threadId, listingSlug, buyerMessage }, sender) {
  const { token, appUrl = DEFAULT_APP_URL } = await chrome.storage.local.get(["token", "appUrl"]);
  if (!token) return { ok: false, error: "Not paired. Paste a pairing token in the Closer popup." };

  // Never send the token anywhere the manifest did not grant.
  const origin = new URL(appUrl).origin;
  if (!chrome.runtime.getManifest().host_permissions.includes(`${origin}/*`)) {
    return { ok: false, error: `${origin} is not in manifest host_permissions. See extension/README.md.` };
  }

  // Derived here from the sender, not trusted from the page.
  const host = new URL(sender.url).hostname;
  const channel = host === "www.facebook.com" ? "FB_MARKETPLACE" : host === "www.kijiji.ca" ? "KIJIJI" : "MOCK";
  const r = await fetch(`${origin}/api/extension/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, channel, threadId, listingSlug, buyerMessage }),
  });
  if (!r.ok) {
    const why = { 401: "Token rejected. Create a new one on the dashboard.", 404: "Listing not found for this token.", 429: "Rate limited. Try again shortly.", 409: "Conflict. Retrying." }[r.status];
    return { ok: false, error: why || `Server error ${r.status}` };
  }
  const j = await r.json();
  return { ok: true, reply: j.reply, status: j.status, pendingApproval: Boolean(j.pendingApproval) };
}
