const $ = (id) => document.getElementById(id);
const DEFAULT_APP_URL = "https://closer-9a91.onrender.com"; // localhost:3100 still works if typed

async function load() {
  const s = await chrome.storage.local.get(["token", "listingSlug", "appUrl", "autoSend"]);
  $("paired").textContent = s.token ? "Paired. Paste a new token to replace it." : "Not paired.";
  $("slug").value = s.listingSlug || "";
  $("appUrl").value = s.appUrl || DEFAULT_APP_URL;
  $("auto").checked = s.autoSend === true; // default off
}

$("save").onclick = async () => {
  const patch = { listingSlug: $("slug").value.trim(), appUrl: $("appUrl").value.trim() || DEFAULT_APP_URL, autoSend: $("auto").checked };
  const token = $("token").value.trim();
  if (token) patch.token = token;
  await chrome.storage.local.set(patch);
  $("token").value = "";
  $("status").textContent = "Saved.";
  load();
};

$("forget").onclick = async () => {
  await chrome.storage.local.remove("token");
  $("status").textContent = "Token removed.";
  load();
};

load();
