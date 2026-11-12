// "Post on Facebook Marketplace": Closer opens Facebook's create-listing form with the public ad text in the
// URL fragment. This fills the form in and stops. The seller adds the photo, picks a category and publishes.
// It never presses Next or Publish, never overwrites a field that already has text, and holds no token.
if (typeof document !== "undefined" && CLOSER_FB_CREATE.matches()) {
  const post = closerParsePost(location.hash);
  if (post) {
    history.replaceState(null, "", location.pathname + location.search); // take the ad text out of the address bar
    const note = document.createElement("div");
    note.setAttribute("data-closer-post", "");
    note.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;max-width:340px;padding:10px 12px;background:#0f172a;color:#fff;font:13px system-ui;border-radius:8px";
    note.textContent = "Closer: filling in your listing...";
    document.documentElement.appendChild(note);

    let tries = 0;
    const timer = setInterval(async () => {
      if (!CLOSER_FB_CREATE.ready() && ++tries < 40) return; // the form renders late; give it 20 seconds
      clearInterval(timer);
      const done = [];
      try {
        if (CLOSER_FB_CREATE.set("Title", post.title)) done.push("title");
        if (CLOSER_FB_CREATE.set("Price", post.price)) done.push("price");
        if (CLOSER_FB_CREATE.set("Description", post.description)) done.push("description");
        if (await CLOSER_FB_CREATE.pick("Condition", closerFbCondition(post.condition))) done.push("condition");
      } catch {}
      // textContent only: the fragment is untrusted, never render it as HTML.
      note.textContent = done.length
        ? `Closer filled in: ${done.join(", ")}. Add your photo, pick a category, check it, then publish.`
        : "Closer could not fill this form. Go back to Closer and copy each field from there.";
    }, 500);
  }
}
