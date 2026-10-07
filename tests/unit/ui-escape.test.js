import { describe, it, expect } from "vitest";
import { escapeText } from "../../public/js/ui.js";

describe("escapeText", () => {
  it("escapes markup and both quote styles for attribute use", () => {
    expect(escapeText(`<img src=x onerror="a('b')">&`)).toBe(
      "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;"
    );
    expect(escapeText(null)).toBe("");
    expect(escapeText(42)).toBe("42");
  });
});
