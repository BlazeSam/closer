// Reads the newest buyer message in the open thread, asks the backend for a reply (via background.js),
// and puts it in the composer as a DRAFT. The seller presses send. It only clicks send when the seller has
// switched auto-send on in the popup (strictly === true; the default is off).
// It reads only the open thread and never touches credentials.

// The reply is for the last message only if the buyer wrote it: if the seller already answered, do nothing.
function pickInbound(msgs) {
  const last = msgs[msgs.length - 1];
  return last && last.inbound && last.text ? last : null;
}

if (typeof module !== "undefined") module.exports = { pickInbound };

if (typeof document !== "undefined") {
  const P = closerPlatform();
  if (P) {
    let busy = false;
    let failed = { key: "", at: 0 };

    const badge = (() => {
      let el;
      return (text) => {
        if (!el) {
          el = document.createElement("div");
          el.setAttribute("data-closer-badge", "");
          el.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;max-width:320px;padding:8px 12px;background:#0f172a;color:#fff;font:13px system-ui;border-radius:8px;white-space:pre-wrap";
          document.documentElement.appendChild(el);
        }
        el.textContent = text; // textContent only: never render server text as HTML
      };
    })();

    const composerText = (el) => ("value" in el ? el.value : el.innerText) || "";

    const landed = (el, text) => composerText(el).includes(text.slice(0, 20));

    const settle = () => new Promise((r) => setTimeout(r, 150));

    // Never throws: any failure returns false so the caller shows the reply in the badge instead of losing it.
    async function insertDraft(el, text) {
      try {
        el.focus();
        if (el.isContentEditable) {
          document.execCommand("selectAll");
          // Facebook's editor (Lexical) updates its DOM after insertText returns. Checking at once read as a
          // failure and the paste fallback inserted the reply a second time (seen live 11 Nov). Wait, then check.
          document.execCommand("insertText", false, text);
          await settle();
          if (landed(el, text)) return true;
          // Fallback for editors that ignore execCommand: a paste-style event carrying the text.
          const dt = new DataTransfer();
          dt.setData("text/plain", text);
          el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertFromPaste", data: text, dataTransfer: dt }));
          await settle();
          if (!landed(el, text)) el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
          await settle();
        } else {
          // Native setter so React-controlled inputs see the change.
          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, text);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return landed(el, text);
      } catch {
        return false;
      }
    }

    async function tick() {
      if (busy) return;
      const threadId = P.threadId();
      const msgs = P.messages().map((el) => ({ inbound: P.isInbound(el), text: P.text(el), id: P.id(el) }));
      const m = threadId && pickInbound(msgs);
      if (!m) return;

      const key = m.id || `${msgs.length}:${m.text}`;
      const { listingSlug, autoSend, handled = {} } = await chrome.storage.local.get(["listingSlug", "autoSend", "handled"]);
      if (handled[threadId] === key) return;
      if (failed.key === key && Date.now() - failed.at < 15000) return;
      const slug = listingSlug || P.listingHint?.();
      if (!slug) return badge("Closer: click the Closer icon in your toolbar and choose which item you are selling.");

      busy = true;
      try {
        badge("Closer: drafting a reply...");
        const res = await chrome.runtime.sendMessage({ type: "closer-reply", threadId, listingSlug: slug, buyerMessage: m.text });
        if (!res?.ok) {
          failed = { key, at: Date.now() };
          return badge(`Closer: ${res?.error || "no response from extension"}`);
        }
        // Mark handled once the backend has the message, so it is never posted twice.
        await chrome.storage.local.set({ handled: { ...handled, [threadId]: key } });

        const box = P.composer();
        if (!box) return badge(`Closer could not find the message box. Reply was:\n${res.reply}`);
        if (composerText(box).trim()) return badge(`Closer: you are typing, so nothing was inserted. Suggested reply:\n${res.reply}`);
        if (!(await insertDraft(box, res.reply))) return badge(`Closer could not insert text. Suggested reply:\n${res.reply}`);

        if (autoSend === true) {
          const btn = P.send();
          if (btn) {
            btn.click();
            return badge("Closer: reply sent (auto-send is on).");
          }
          return badge("Closer: drafted, but could not find the send button. Press send yourself.");
        }
        // Name the item: on Facebook the popup's item applied to an unrelated thread and nobody could tell (11 Nov).
        badge(`Closer (selling: ${slug}): draft ready. ${res.pendingApproval ? "Seller approval is pending on the dashboard." : "Review it and press send."}`);
      } finally {
        busy = false;
      }
    }

    let timer;
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(tick, 300); }).observe(document.body, { childList: true, subtree: true });
    setInterval(tick, 3000); // retries after a failed call
    tick();
  }
}
