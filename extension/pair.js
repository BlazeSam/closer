// Runs only on the Closer dashboard (see manifest). Lets the dashboard hand the extension a pairing token with
// one click, so the seller never copies or pastes it. Only messages from this same page and origin are accepted.
window.addEventListener("message", async (e) => {
  if (e.source !== window || e.origin !== location.origin || e.data?.type !== "closer-pair") return;
  const token = String(e.data.token || "");
  if (!/^clsr_[0-9a-f]{48}$/.test(token)) return;
  await chrome.storage.local.set({ token, appUrl: location.origin });
  window.postMessage({ type: "closer-paired" }, location.origin);
});
