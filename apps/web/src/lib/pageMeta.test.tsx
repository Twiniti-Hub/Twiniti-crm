import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installHappyDom } from "../test/happyDom.js";
import { usePageMeta } from "./pageMeta.js";

let domWindow: ReturnType<typeof installHappyDom>;

before(() => {
  domWindow = installHappyDom();
});

after(() => {
  domWindow.close();
});

function MetaDriver({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function Page({ title, description }: { title: string; description: string }) {
  usePageMeta(title, description);
  return null;
}

test("usePageMeta restores the prior description on unmount", () => {
  const initial = document.createElement("meta");
  initial.name = "description";
  initial.content = "server-default";
  document.head.append(initial);

  const container = document.createElement("div");
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      <MetaDriver>
        <Page title="Route A" description="Route A description" />
      </MetaDriver>
    );
  });

  const live = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  assert.equal(live?.content, "Route A description");

  act(() => {
    root.unmount();
  });

  const restored = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  assert.equal(restored?.content, "server-default");
  initial.remove();
});