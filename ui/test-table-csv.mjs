import assert from "node:assert/strict";
import test from "node:test";
import { tableCsv } from "./src/tableCsv.mjs";

test("keeps Indian currency, quotes, commas and multiline customer notes in their cells", () => {
  const csv = tableCsv(["Amount", "Note"], [["₹1,200.50", 'Oak "A"\nLeft side']]);
  assert.equal(csv, '\uFEFF"Amount","Note"\r\n"₹1,200.50","Oak ""A""\nLeft side"\r\n');
});

test("keeps formula-like entries and international phone numbers literal", () => {
  assert.equal(
    tableCsv(["Text"], [["=SUM(1,2)"], ["  @name"], ["+91 12345"], ["-121.5"], [null]]),
    '\uFEFF"Text"\r\n"\'=SUM(1,2)"\r\n"\'  @name"\r\n"\'+91 12345"\r\n"-121.5"\r\n""\r\n',
  );
});
