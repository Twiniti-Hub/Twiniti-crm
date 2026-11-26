import { Window as HappyWindow } from "happy-dom";

export function installHappyDom(url = "https://loop.example.com/") {
  const domWindow = new HappyWindow({ url });
  globalThis.window = domWindow as unknown as Window & typeof globalThis;
  globalThis.document = domWindow.document as unknown as Document;
  globalThis.localStorage = domWindow.localStorage;
  globalThis.sessionStorage = domWindow.sessionStorage;
  globalThis.location = domWindow.location as unknown as Location;
  globalThis.HTMLElement = domWindow.HTMLElement as unknown as typeof HTMLElement;
  globalThis.Node = domWindow.Node as unknown as typeof Node;
  globalThis.MutationObserver = domWindow.MutationObserver as unknown as typeof MutationObserver;
  globalThis.requestAnimationFrame =
    domWindow.requestAnimationFrame.bind(domWindow) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame =
    domWindow.cancelAnimationFrame.bind(domWindow) as unknown as typeof cancelAnimationFrame;
  globalThis.getComputedStyle =
    domWindow.getComputedStyle.bind(domWindow) as unknown as typeof getComputedStyle;
  return domWindow;
}