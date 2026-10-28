import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});


beforeEach(() => { window.history.replaceState(null, "", "/"); });
