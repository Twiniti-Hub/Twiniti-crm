import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { StackClientApp } from "@hexclave/react";
import { HexclaveClientApp, HexclaveProvider, HexclaveTheme } from "@hexclave/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { installHappyDom } from "../test/happyDom.js";
import { shouldMountHexclaveAuthShell } from "../lib/hexclaveShellMount.js";

let domWindow: ReturnType<typeof installHappyDom>;
let testHexclaveApp: StackClientApp<true>;

function mountInDocument(tree: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(tree);
  });
  return { container, root };
}

before(() => {
  domWindow = installHappyDom();
  testHexclaveApp = new HexclaveClientApp({
    projectId: "00000000-0000-4000-8000-000000000099",
    tokenStore: "memory",
    analytics: { enabled: false },
    urls: {
      handler: "/handler",
      signIn: "/sign-in",
      signUp: "/sign-up",
      afterSignIn: "/overview",
      afterSignUp: "/overview",
      afterSignOut: "/",
      home: "/"
    }
  });
});

after(() => {
  domWindow.close();
});

test("shouldMountHexclaveAuthShell keeps /, /pricing, and /sign-up under Hexclave when auth is on", () => {
  for (const pathname of ["/", "/pricing", "/sign-up"] as const) {
    assert.equal(
      shouldMountHexclaveAuthShell(true, true),
      true,
      `expected provider mount for anonymous ${pathname}`
    );
  }
});

test("anonymous /, /pricing, and /sign-up render under HexclaveProvider", async () => {
  const { LandingPage } = await import("../pages/LandingPage.js");
  const { PricingPage } = await import("../pages/PricingPage.js");
  const { SignUpPage } = await import("../pages/SignUpPage.js");

  const cases: Array<[string, () => ReactNode, RegExp]> = [
    ["/", () => <LandingPage />, /small businesses/i],
    ["/pricing", () => <PricingPage />, /Loop pricing/i],
    ["/sign-up", () => <SignUpPage />, /Start your Loop workspace/i]
  ];

  for (const [pathname, renderPage, pattern] of cases) {
    const { container, root } = mountInDocument(
      <MemoryRouter initialEntries={[pathname]}>
        <HexclaveProvider app={testHexclaveApp}>
          <HexclaveTheme>
            <Routes>
              <Route path="*" element={renderPage()} />
            </Routes>
          </HexclaveTheme>
        </HexclaveProvider>
      </MemoryRouter>
    );
    assert.match(container.textContent ?? "", pattern, `expected copy on ${pathname}`);
    assert.doesNotMatch(container.textContent ?? "", /must be used within/i, `provider error on ${pathname}`);
    act(() => {
      root.unmount();
      container.remove();
    });
  }
});