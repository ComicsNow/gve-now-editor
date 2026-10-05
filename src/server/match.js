'use strict';

// Candidate scoring for import: weighted identity components with the Python-parity
// series similarity; absent components are excluded and the weights renormalized.

const { calculateSimilarity } = require('../shared/similarity');
const { normalizeIssueNumber, normalizeYear } = require('../shared/numbering');

const WEIGHTS = { series: 0.45, number: 0.2, year: 0.1, pageCount: 0.1, fileName: 0.1 };
const MIN_SERIES = 0.4;

function baseName(fileName) {
  return String(fileName || '').replace(/\.(cbz|cbr|pdf)$/i, '');
}

function seriesOf(comic) {
  return comic.series || (comic.metadata && comic.metadata.Series) || '';
}

function scoreCandidate(exportComic, candidate) {
  if (exportComic.sourceComicId && candidate.id === exportComic.sourceComicId) {
    return { comic: candidate, score: 1, sourceComicIdMatch: true, breakdown: { series: { weight: WEIGHTS.series, score: 1, reason: 'same comic id' } } };
  }

  const breakdown = {};
  let weightSum = 0;
  let scoreSum = 0;
  const add = (key, score) => {
    breakdown[key] = { weight: WEIGHTS[key], score };
    weightSum += WEIGHTS[key];
    scoreSum += WEIGHTS[key] * score;
  };

  const seriesA = seriesOf(exportComic) || exportComic.fileBaseName || '';
  const seriesB = seriesOf(candidate) || baseName(candidate.name);
  if (seriesA && seriesB) add('series', calculateSimilarity(seriesA, seriesB));

  const numberA = normalizeIssueNumber(exportComic.number);
  const numberB = normalizeIssueNumber(candidate.metadata && candidate.metadata.Number);
  if (numberA !== null && numberB !== null) add('number', numberA === numberB ? 1 : 0);

  const yearA = normalizeYear(exportComic.year);
  const yearB = normalizeYear(candidate.metadata && candidate.metadata.Year);
  if (yearA !== null && yearB !== null) {
    const diff = Math.abs(Number(yearA) - Number(yearB));
    add('year', diff === 0 ? 1 : diff === 1 ? 0.5 : 0);
  }

  if (Number.isFinite(exportComic.pageCount) && Number.isFinite(candidate.totalPages) && candidate.totalPages > 0) {
    const diff = Math.abs(exportComic.pageCount - candidate.totalPages);
    add('pageCount', diff === 0 ? 1 : diff <= 2 ? 0.7 : 0);
  }

  const nameA = exportComic.fileBaseName || baseName(exportComic.fileName);
  const nameB = baseName(candidate.name);
  if (nameA && nameB) add('fileName', calculateSimilarity(nameA, nameB));

  const score = weightSum > 0 ? scoreSum / weightSum : 0;
  return { comic: candidate, score, sourceComicIdMatch: false, breakdown };
}

function rankCandidates(exportComic, candidates, { limit = 5, minSeries = MIN_SERIES } = {}) {
  return candidates
    .map((candidate) => scoreCandidate(exportComic, candidate))
    .filter((entry) => {
      if (entry.sourceComicIdMatch) return true;
      const series = entry.breakdown.series;
      return !series || series.score >= minSeries;
    })
    .sort((a, b) => (b.score - a.score) || String(a.comic.id).localeCompare(String(b.comic.id)))
    .slice(0, limit);
}

module.exports = { WEIGHTS, MIN_SERIES, scoreCandidate, rankCandidates };
