import { describe, it, expect } from "vitest";
import { waLink, smsLink } from "./links";

describe("waLink — international number normalisation", () => {
  it("converts a local TZ number (leading 0) to international for wa.me", () => {
    // The bug: "0686450999" → wa.me/0686450999 is rejected by WhatsApp ("link failed").
    expect(waLink("0686450999", "hi")).toBe("https://wa.me/255686450999?text=hi");
  });
  it("keeps an already-international +255 number", () => {
    expect(waLink("+255787807807", "hi")).toBe("https://wa.me/255787807807?text=hi");
  });
  it("keeps a foreign +91 number untouched", () => {
    expect(waLink("+919824426407", "hi")).toBe("https://wa.me/919824426407?text=hi");
  });
  it("handles a 00 international prefix", () => {
    expect(waLink("0044 7911 123456", "hi")).toBe("https://wa.me/447911123456?text=hi");
  });
  it("prepends the country code to a bare 9-digit local subscriber number", () => {
    expect(waLink("686450999", "hi")).toBe("https://wa.me/255686450999?text=hi");
  });
  it("returns null when there is no number", () => {
    expect(waLink(null, "hi")).toBeNull();
    expect(waLink("", "hi")).toBeNull();
  });
  it("url-encodes the message body", () => {
    expect(waLink("+255787807807", "a b")).toContain("text=a%20b");
  });
});

describe("smsLink", () => {
  it("builds an sms: link with the body", () => {
    expect(smsLink("+255787807807", "hi")).toBe("sms:255787807807?body=hi");
  });
});
