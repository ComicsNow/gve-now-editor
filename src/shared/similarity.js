'use strict';

// Exact port of tagger/tagger_app/core/metadata.py calculate_similarity (line 759).
// Golden-vector tests pin parity with the Python implementation.

function cleanForSimilarity(input) {
  if (input === null || input === undefined) return '';
  let s = String(input).toLowerCase();
  if (s.endsWith('.cbz')) s = s.slice(0, -4);
  s = s.replace(/[\(\[\{].*?[\)\]\}]/g, '');
  s = s.replace(/\bv(ol|olume)?\.?\s*\d+\b/g, '');
  s = s.replace(/#\d+\b/g, '');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  return s.split(/\s+/).filter(Boolean).join(' ');
}

// difflib.SequenceMatcher.find_longest_match (no junk elements).
function findLongestMatch(a, b, alo, ahi, blo, bhi, b2j) {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let j2len = new Map();
  for (let i = alo; i < ahi; i++) {
    const newj2len = new Map();
    const positions = b2j.get(a[i]) || [];
    for (const j of positions) {
      if (j < blo) continue;
      if (j >= bhi) break;
      const k = (j2len.get(j - 1) || 0) + 1;
      newj2len.set(j, k);
      if (k > bestsize) {
        besti = i - k + 1;
        bestj = j - k + 1;
        bestsize = k;
      }
    }
    j2len = newj2len;
  }
  return { i: besti, j: bestj, size: bestsize };
}

// difflib.SequenceMatcher.get_matching_blocks total size, then ratio = 2M/T.
function sequenceMatcherRatio(a, b) {
  const total = a.length + b.length;
  if (total === 0) return 1;
  const b2j = new Map();
  for (let j = 0; j < b.length; j++) {
    const c = b[j];
    if (!b2j.has(c)) b2j.set(c, []);
    b2j.get(c).push(j);
  }
  const queue = [[0, a.length, 0, b.length]];
  let matched = 0;
  while (queue.length > 0) {
    const [alo, ahi, blo, bhi] = queue.pop();
    const m = findLongestMatch(a, b, alo, ahi, blo, bhi, b2j);
    if (m.size > 0) {
      matched += m.size;
      if (alo < m.i && blo < m.j) queue.push([alo, m.i, blo, m.j]);
      if (m.i + m.size < ahi && m.j + m.size < bhi) queue.push([m.i + m.size, ahi, m.j + m.size, bhi]);
    }
  }
  return (2 * matched) / total;
}

function calculateSimilarity(string1, string2) {
  if (!string1 || !string2) return 0;
  const c1 = cleanForSimilarity(string1);
  const c2 = cleanForSimilarity(string2);
  if (!c1 || !c2) return 0;
  if (c1 === c2) return 1;

  const shorter = c1.length < c2.length ? c1 : c2;
  const longer = c1.length < c2.length ? c2 : c1;
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.85) return 0.9;

  return sequenceMatcherRatio(c1, c2);
}

module.exports = { cleanForSimilarity, sequenceMatcherRatio, calculateSimilarity };
