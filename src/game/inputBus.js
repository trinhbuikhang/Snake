// Tiny pub/sub that lets DOM controls (D-pad, swipe) and the engine share input.
const subs = new Set()

export const inputBus = {
  on(fn) {
    subs.add(fn)
    return () => subs.delete(fn)
  },
  emit(event) {
    subs.forEach((fn) => fn(event))
  },
}