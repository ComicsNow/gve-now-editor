'use strict';

// Canonicalize issue numbers: "01"/"#3"/"1.0" -> "1"/"3"/"1"; non-numeric designators kept.
function normalizeIssueNumber(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/^#/, '').trim();
  if (/^\d+(\.\d+)?$/.test(s)) return String(Number(s));
  return s.toLowerCase();
}

// Canonicalize volume markers: "Vol. 2"/"v2"/"02" -> "2".
function normalizeVolume(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/^v(?:ol(?:ume)?)?\.?\s*/i, '').trim();
  if (/^\d+(\.\d+)?$/.test(s)) return String(Number(s));
  return s.toLowerCase();
}

function normalizeYear(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).match(/(19|20)\d{2}/);
  return m ? m[0] : null;
}

// Best-effort identity hints from a release filename, e.g.
// "01 Closer to Danger [AAM-Markosia] (2024) #23.cbz" -> series/number/year/null.
function parseFileNameHints(fileName) {
  let s = String(fileName || '').replace(/\.(cbz|cbr|pdf)$/i, '');

  let year = null;
  const years = s.match(/\((19|20)\d{2}\)/g);
  if (years) year = years[years.length - 1].slice(1, -1);

  s = s.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');

  let number = null;
  const numMatch = s.match(/#\s*(\d+(?:\.\d+)?)/);
  if (numMatch) {
    number = normalizeIssueNumber(numMatch[1]);
    s = s.replace(numMatch[0], ' ');
  }

  let volume = null;
  const volMatch = s.match(/\bv(?:ol(?:ume)?)?\.?\s*(\d+)\b/i);
  if (volMatch) {
    volume = normalizeVolume(volMatch[1]);
    s = s.replace(volMatch[0], ' ');
  }

  s = s.replace(/^\s*\d+\s+/, ' '); // leading ordering index, e.g. "01 "
  const series = s.replace(/\s+/g, ' ').trim();

  return { series: series || null, number, year, volume };
}

module.exports = { normalizeIssueNumber, normalizeVolume, normalizeYear, parseFileNameHints };
