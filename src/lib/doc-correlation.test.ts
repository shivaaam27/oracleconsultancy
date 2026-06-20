import { describe, it, expect } from "vitest";
import {
  normalisePhone, extractPhones, extractEmails, extractBankAccounts,
  normaliseAddress, extractAddresses, personNamesMatch,
} from "./doc-correlation";

describe("normalisePhone", () => {
  it("collapses +255 / 255 / 0 / 00255 variants to one 9-digit key", () => {
    const k = "712345678";
    expect(normalisePhone("+255 712 345 678")).toBe(k);
    expect(normalisePhone("255712345678")).toBe(k);
    expect(normalisePhone("0712345678")).toBe(k);
    expect(normalisePhone("0712-345-678")).toBe(k);
    expect(normalisePhone("00255 712 345 678")).toBe(k);
  });
  it("rejects things that aren't TZ phone numbers", () => {
    expect(normalisePhone("12345")).toBeNull();        // too short
    expect(normalisePhone("123456789012345")).toBeNull(); // too long (account/ref)
    expect(normalisePhone("abc")).toBeNull();
  });
});

describe("extractPhones", () => {
  it("finds the same number written two ways and dedupes", () => {
    const got = extractPhones("Call +255 712 345 678 or 0712345678 for details.");
    expect(got).toEqual(["712345678"]);
  });
  it("does not treat a 9-digit TIN as a phone", () => {
    expect(extractPhones("TIN 123-456-789")).toEqual([]);
  });
});

describe("extractEmails", () => {
  it("extracts and lowercases", () => {
    expect(extractEmails("Contact Samir.Manek@Oracle.co.TZ today")).toEqual(["samir.manek@oracle.co.tz"]);
  });
});

describe("extractBankAccounts", () => {
  it("reads a labelled account number", () => {
    expect(extractBankAccounts("A/C No: 0150 1234 5678 90")).toContain("01501234567890");
  });
  it("reads a bare long account run but not a phone or TIN", () => {
    const got = extractBankAccounts("Acct 01234567890123 phone 0712345678 tin 123456789");
    expect(got).toContain("01234567890123");
    expect(got).not.toContain("712345678");
    expect(got).not.toContain("123456789");
  });
});

describe("normaliseAddress", () => {
  it("normalises abbreviations and punctuation to one key", () => {
    const a = normaliseAddress("Plot 12, Bagamoyo Rd.");
    const b = normaliseAddress("plot 12 bagamoyo road");
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
  it("rejects a generic city-only line", () => {
    expect(normaliseAddress("Dar es Salaam")).toBeNull();
  });
  it("accepts a PO box line without a street number", () => {
    expect(normaliseAddress("P.O. Box 1234 Dar")).not.toBeNull();
  });
});

describe("extractAddresses", () => {
  it("pulls a specific line from flattened comma-joined text", () => {
    const got = extractAddresses("Pinnacle Ltd, Plot 12 Bagamoyo Road, Dar es Salaam");
    expect(got.some((a) => a.includes("plot 12 bagamoyo road"))).toBe(true);
    // The bare city must not become a correlation key.
    expect(got).not.toContain("dar es salaam");
  });
});

describe("personNamesMatch — same person spelled differently", () => {
  it("matches initials against full given/middle names", () => {
    expect(personNamesMatch("S. J. Manek", "Samir Jayantilal Manek")).toBe(true);
    expect(personNamesMatch("Samir J. Manek", "Samir Jayantilal Manek")).toBe(true);
    expect(personNamesMatch("Samir Manek", "Samir Jayantilal Manek")).toBe(true);
  });
  it("ignores honorifics", () => {
    expect(personNamesMatch("Mr Samir Manek", "Samir Manek")).toBe(true);
  });
  it("does NOT merge two different people who share a surname", () => {
    expect(personNamesMatch("Samir Manek", "Anita Manek")).toBe(false);
    expect(personNamesMatch("S. Manek", "Anita Manek")).toBe(false);
  });
  it("does NOT merge on a single shared token", () => {
    expect(personNamesMatch("Samir", "Samir Manek")).toBe(false); // single-token input
    expect(personNamesMatch("Samir Patel", "Samir Manek")).toBe(false); // surnames clash
  });
  it("does not match when the given name contradicts", () => {
    expect(personNamesMatch("J. Manek", "Samir Manek")).toBe(false); // J vs Samir
  });
});
