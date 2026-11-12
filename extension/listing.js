// "Add to Closer": on the seller's own marketplace listing page, a small button reads the listing (read-only,
// via selectors.js) and opens /sell/new on the Closer app pre-filled. Nothing on the marketplace is changed.
// The seller still sets the lowest and auto-accept prices and saves. No token is involved: the data is public
// listing text and travels in the new tab's URL.
const CLOSER_DEFAULT_APP_URL = "https://closer-9a91.onrender.com";

if (typeof document !== "undefined") {
  let btn;
  // Facebook is a single-page app, so watch the URL instead of assuming the page we were injected on.
  setInterval(() => {
    const page = closerListingPage();
    if (!page) {
      btn?.remove();
      btn = null;
      return;
    }
    if (btn) return;
    btn = document.createElement("button");
    btn.setAttribute("data-closer-add", "");
    btn.textContent = "Add to Closer";
    btn.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 14px;background:#0f172a;color:#fff;font:600 14px system-ui;border:0;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    btn.onclick = async () => {
      try {
        const d = page.read();
        const { appUrl = CLOSER_DEFAULT_APP_URL } = await chrome.storage.local.get("appUrl");
        const origin = new URL(appUrl).origin;
        if (!chrome.runtime.getManifest().host_permissions.includes(`${origin}/*`)) return alert(`Closer: ${origin} is not an allowed Closer address.`);
        const q = new URLSearchParams({ from: page.source });
        for (const [k, v] of Object.entries(d)) {
          if (v == null || v === "") continue;
          // A cut-off signed photo link is a broken link: drop it rather than truncate it.
          if (k === "imageUrl" && String(v).length > 2000) continue;
          q.set(k, k === "imageUrl" ? String(v) : String(v).slice(0, 1500));
        }
        window.open(`${origin}/sell/new?${q}`, "_blank", "noopener");
      } catch (e) {
        alert(`Closer could not read this listing (${e?.message || e}). Create it on Closer by hand.`);
      }
    };
    document.documentElement.appendChild(btn);
  }, 1000);
}
