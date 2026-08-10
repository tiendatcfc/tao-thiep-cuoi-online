import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's automatic cleanup-after-each-test only registers
// itself when it detects a global `afterEach` (Jest-style globals). This
// project imports `describe`/`it`/`expect` explicitly instead of enabling
// vitest's `test.globals`, so cleanup is wired up by hand here — otherwise
// every test after the first renders into a `document.body` still holding
// every previous test's DOM tree.
afterEach(() => {
  cleanup();
});
