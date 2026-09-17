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

// Stub IntersectionObserver for jsdom — framer-motion's whileInView feature
// uses it, but jsdom doesn't have a real implementation. This minimal stub
// prevents "ReferenceError: IntersectionObserver is not defined" when tests
// render components with framer-motion's whileInView. Actual scroll-triggered
// animation behavior is verified manually in the browser.
if (typeof window !== "undefined" && !window.IntersectionObserver) {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).IntersectionObserver = MockIntersectionObserver;
}

// ProseMirror (TipTap) measures the caret with `Range#getClientRects` /
// `getBoundingClientRect` whenever it scrolls the selection into view after
// a transaction. jsdom implements the Range API but none of its layout
// methods, so any editor command would throw
// "target.getClientRects is not a function" — from inside ProseMirror's
// dispatch, i.e. as an unhandled error rather than a test failure.
//
// Zero-sized rects are the honest answer here: jsdom has no layout, so
// nothing about caret POSITION can be tested in this environment anyway.
// What the editor tests assert is document content, which is unaffected.
if (typeof window !== "undefined" && typeof Range !== "undefined") {
  const emptyRect = () =>
    ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const emptyRectList = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;

  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyRectList;
    Range.prototype.getBoundingClientRect = emptyRect;
  }
}
