// Pure keyboard helpers — no DOM/React/Three imports, unit-testable in Node.

// True when a keyboard event's target is a text-entry element (an <input>,
// <textarea>, <select>, or any contenteditable element). While the player
// is typing — e.g. in the Journal's gardener-name field — the game's
// global shortcuts must ignore every key, Escape included: Esc neither
// blurs the field nor triggers any game action.
export function isTypingTarget(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '')
}
