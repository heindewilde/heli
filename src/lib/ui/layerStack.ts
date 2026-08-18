/**
 * One stack of open overlays, and one pair of window listeners for all of them.
 *
 * The `dismiss` action this replaces attached its own `keydown` listener per
 * call site, so a single Escape closed *every* open popover at once — including
 * a menu's parent dialog. Outside-click had the same shape: each layer decided
 * for itself, with no notion of which one was on top.
 *
 * Here, Escape dismisses exactly the topmost layer. A pointer press dismisses
 * every layer from the top down until it reaches one that contains the target,
 * so clicking the page behind a menu-inside-a-dialog closes both, while
 * clicking the dialog body closes only the menu.
 */

type Layer = {
  id: number;
  /** True when the event target is inside this layer (trigger included). */
  contains: (target: Node) => boolean;
  onDismiss: () => void;
};

const stack: Layer[] = [];
let nextId = 1;
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (!top) return;
  // Stop here: a nested layer must not let Escape fall through to its parent.
  e.stopPropagation();
  top.onDismiss();
}

function onPointerDown(e: MouseEvent) {
  const target = e.target as Node | null;
  if (!target) return;
  // Snapshot: onDismiss mutates the stack as we walk it.
  for (let i = stack.length - 1; i >= 0; i--) {
    const layer = stack[i];
    if (layer.contains(target)) break;
    layer.onDismiss();
  }
}

function sync() {
  const shouldListen = stack.length > 0;
  if (shouldListen === listening) return;
  listening = shouldListen;
  if (shouldListen) {
    // Capture phase so a layer sees Escape before a text input's own handler
    // can swallow it, and `mousedown` (not `click`) so a press outside closes
    // before focus moves — the ordering the pickers already depend on.
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onPointerDown, true);
  } else {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('mousedown', onPointerDown, true);
  }
}

export type LayerHandle = { release: () => void };

export function pushLayer(layer: Omit<Layer, 'id'>): LayerHandle {
  const id = nextId++;
  stack.push({ ...layer, id });
  sync();
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      const i = stack.findIndex((l) => l.id === id);
      if (i !== -1) stack.splice(i, 1);
      sync();
    }
  };
}

/**
 * Open overlays, top of the stack last.
 *
 * Exposed for tests, for debugging a stuck overlay, and — the reason it is no
 * longer only a debug seam — so a global Escape *command* can stand down while
 * a layer is open. The command registry is a second window listener and does
 * not know about this stack, so without the guard one Escape would both close
 * the popover you opened and clear the selection underneath it.
 */
export function layerDepth(): number {
  return stack.length;
}
