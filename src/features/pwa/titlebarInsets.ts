export interface TitlebarInsets {
  top: number;
  left: number;
  right: number;
  height: number;
}

const EMPTY_INSETS: TitlebarInsets = { top: 0, left: 0, right: 0, height: 0 };

/** Space the OS caption buttons occupy around the WCO titlebar area. */
export function titlebarInsetsFromRect(
  rect: { x: number; y: number; width: number; height: number } | null,
  viewport: { width: number; height: number },
  visible: boolean,
): TitlebarInsets {
  if (!visible || !rect || rect.width <= 0 || viewport.width <= 0) {
    return EMPTY_INSETS;
  }
  return {
    top: Math.max(0, Math.round(rect.y)),
    left: Math.max(0, Math.round(rect.x)),
    right: Math.max(0, Math.round(viewport.width - rect.x - rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

export function applyTitlebarInsets(insets: TitlebarInsets, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--wco-inset-top', `${insets.top}px`);
  root.style.setProperty('--wco-inset-left', `${insets.left}px`);
  root.style.setProperty('--wco-inset-right', `${insets.right}px`);
  root.style.setProperty('--wco-titlebar-height', `${insets.height}px`);
  if (insets.right > 0 || insets.left > 0 || insets.height > 0) {
    root.dataset.wco = 'on';
  } else {
    delete root.dataset.wco;
  }
}
