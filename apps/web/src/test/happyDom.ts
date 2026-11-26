import { Window as HappyWindow } from "happy-dom";

export function installHappyDom(url = "https://loop.example.com/") {
  const domWindow = new HappyWindow({ url });
  globalThis.window = domWindow as unknown as Window & typeof globalThis;
  globalThis.document = domWindow.document;
  globalThis.localStorage = domWindow.localStorage;
  globalThis.sessionStorage = domWindow.sessionStorage;
  globalThis.location = domWindow.location;
  globalThis.HTMLElement = domWindow.HTMLElement;
  globalThis.Node = domWindow.Node;
  globalThis.MutationObserver = domWindow.MutationObserver;
  globalThis.requestAnimationFrame = domWindow.requestAnimationFrame.bind(domWindow);
  globalThis.cancelAnimationFrame = domWindow.cancelAnimationFrame.bind(domWindow);
  globalThis.getComputedStyle = domWindow.getComputedStyle.bind(domWindow);
  return domWindow;
}