import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
  } as unknown as typeof DOMMatrix;
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});


beforeEach(() => { window.history.replaceState(null, "", "/"); });
