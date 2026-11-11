const $ = (id) => document.getElementById(id);
const DEFAULT_APP_URL = "https://closer-9a91.onrender.com"; // localhost:3100 still works if typed

// Fills the item picker from the seller's own listings. Falls back to the saved slug if the call fails.
async function listings(token, appUrl, current) {
  const sel = $("slug");
  sel.replaceChildren(new Option("Choose an item...", ""));
  let items = [];
  if (token) {
    try {
      const r = await fetch(`${new URL(appUrl).origin}/api/extension/listings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (r.ok) items = await r.json();
      else if (r.status === 401) $("state").textContent = "Connection expired. Open your Closer dashboard and click \"Connect this browser\" again.";
    } catch {}
  }
  if (current && !items.some((l) => l.slug === current)) items.push({ slug: current, title: current });
  for (const l of items) sel.add(new Option(l.title, l.slug, false, l.slug === current));
}

async function load() {
  const s = await chrome.storage.local.get(["token", "listingSlug", "appUrl", "autoSend"]);
  const appUrl = s.appUrl || DEFAULT_APP_URL;
  $("state").textContent = s.token
    ? "Connected. Open a buyer chat and Closer drafts your reply."
    : "Not connected. Open your Closer dashboard and click \"Connect this browser\".";
  $("appUrl").value = appUrl;
  $("auto").checked = s.autoSend === true; // default off
  await listings(s.token, appUrl, s.listingSlug);
}

$("save").onclick = async () => {
  const patch = { listingSlug: $("slug").value, appUrl: $("appUrl").value.trim() || DEFAULT_APP_URL, autoSend: $("auto").checked };
  const token = $("token").value.trim();
  if (token) patch.token = token;
  await chrome.storage.local.set(patch);
  $("token").value = "";
  $("status").textContent = "Saved.";
  load();
};

$("forget").onclick = async () => {
  await chrome.storage.local.remove("token");
  $("status").textContent = "Disconnected.";
  load();
};

load();
