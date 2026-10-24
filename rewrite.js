const fs = require('fs');

const content = fs.readFileSync('src/shared/sidecar.js', 'utf8');

const replacement = `  const seqBoxes = (Array.isArray(page.sequence) ? page.sequence : []).map(normalizeBox).filter(Boolean);

  const { boxes, boxPoints } = extractValidBoxes(rawPanels, rawPanelPoints);
  const { boxes: bubbles, boxPoints: bubblePoints } = extractValidBoxes(rawBubbles, rawBubblePoints);

  if (type === 'manga') {
    return normalizeMangaPage(items, push, seqBoxes, boxes, boxPoints, bubbles, bubblePoints, warnings);
  }
  return normalizeWesternPage(items, push, seqBoxes, boxes, boxPoints, bubbles, bubblePoints, warnings);
}`;

const startIndex = content.indexOf('  const seqBoxes = (Array.isArray(page.sequence) ? page.sequence : []).map(normalizeBox).filter(Boolean);');
const endIndex = content.indexOf('function pruneWesternPanels(page, type) {');

if (startIndex !== -1 && endIndex !== -1) {
  const newContent = content.slice(0, startIndex) + replacement + '\n\n' + content.slice(endIndex);
  fs.writeFileSync('src/shared/sidecar.js', newContent);
  console.log('Successfully updated sidecar.js');
} else {
  console.log('Failed to find start or end index');
}
