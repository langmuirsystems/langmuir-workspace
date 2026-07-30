# The scan-box focus rule

*Never refocus a scan box on a blur timer or on every poll re-render. It makes the rest of the screen unusable.*

**Rule: a scan/QR input may only take the cursor back (a) when its screen opens, (b) after a tap on NON-interactive chrome, or (c) if it already had focus before a re-render. Never on a blur timer, never unconditionally after a poll.**

## Why

`shipping.html` hit this first: Paul got logged out mid-pick and the scan box stole the cursor from the login form. Then `line.html`'s Pack & Ship tab hit it again on 2026-07-28. Its `focusPackScan` set `s.onblur` to refocus 900ms later, AND `renderPack()` refocused on every 12-second poll.

Net effect on the floor: "once you're picking an order you can't select another line, the mouse keeps auto-selecting the QR box." The line switcher `<select>`, the tab bar, and the overlay inputs were all unusable while an order was open, and a half-typed scan was wiped every 12 seconds.

## The working pattern

Now in both `shipping.html` and `line.html`:

```js
function scanLive(){
  return onThatView && activeJob && !document.querySelector('.reason-overlay[style*="flex"]');
}
function focusScan(){
  setTimeout(function(){
    var s = document.getElementById('scan');
    if (s && scanLive()) s.focus();
  }, 50);
}
document.addEventListener('click', function(e){
  // aiming at something else
  if (e.target.closest('input,textarea,select,button,a,label,option,[contenteditable]')) return;
  if (scanLive()) focusScan();
});
```

In any poll-driven re-render that rebuilds the input: carry `prev.value` across, and only call `focusScan` when `document.activeElement === prev` (or the input did not exist yet).

The same carry pattern also preserves edited weight and dims inputs across re-renders, via a `value !== defaultValue` check.

Related: [line-packing](line-packing.md), [freight-booking](freight-booking.md)
