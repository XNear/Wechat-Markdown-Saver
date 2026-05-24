// post-processor.js — Markdown formatting optimizations

function postProcessMarkdown(markdown) {
  let result = markdown;

  // Do NOT process code blocks — extract them, process text, then restore
  const codeBlocks = [];
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return '%%CODEBLOCK_' + (codeBlocks.length - 1) + '%%';
  });

  // Also protect inline code
  const inlineCodes = [];
  result = result.replace(/`[^`\n]+`/g, (match) => {
    inlineCodes.push(match);
    return '%%INLINECODE_' + (inlineCodes.length - 1) + '%%';
  });

  // Also protect image links (don't add spaces inside ![alt](url))
  const imageLinks = [];
  result = result.replace(/!\[[^\]]*\]\([^)]+\)/g, (match) => {
    imageLinks.push(match);
    return '%%IMAGELINK_' + (imageLinks.length - 1) + '%%';
  });

  // Also protect regular links
  const links = [];
  result = result.replace(/\[[^\]]*\]\([^)]+\)/g, (match) => {
    links.push(match);
    return '%%LINK_' + (links.length - 1) + '%%';
  });

  // Also protect URLs
  const urls = [];
  result = result.replace(/https?:\/\/[^\s)]+/g, (match) => {
    urls.push(match);
    return '%%URL_' + (urls.length - 1) + '%%';
  });

  // --- 1. Chinese/English/Digit spacing ---
  // CJK character followed by ASCII letter/digit
  result = result.replace(/([一-鿿㐀-䶿豈-﫿　-〿＀-￯])([A-Za-z0-9])/g, '$1 $2');
  // ASCII letter/digit followed by CJK character
  result = result.replace(/([A-Za-z0-9])([一-鿿㐀-䶿豈-﫿　-〿＀-￯])/g, '$1 $2');

  // --- 2. Blank line normalization ---
  // Collapse 3+ consecutive newlines to 2 (one blank line)
  result = result.replace(/\n{3,}/g, '\n\n');
  // Remove leading/trailing excessive newlines
  result = result.replace(/^\n{2,}/, '');
  result = result.replace(/\n{2,}$/, '\n');

  // --- 3. Heading hierarchy check ---
  result = fixHeadingHierarchy(result);

  // Restore protected blocks
  codeBlocks.forEach((block, i) => { result = result.replace('%%CODEBLOCK_' + i + '%%', block); });
  inlineCodes.forEach((code, i) => { result = result.replace('%%INLINECODE_' + i + '%%', code); });
  imageLinks.forEach((link, i) => { result = result.replace('%%IMAGELINK_' + i + '%%', link); });
  links.forEach((link, i) => { result = result.replace('%%LINK_' + i + '%%', link); });
  urls.forEach((url, i) => { result = result.replace('%%URL_' + i + '%%', url); });

  return result;
}

function fixHeadingHierarchy(markdown) {
  const lines = markdown.split('\n');
  let expectedLevel = 2; // After H1 title, next should be H2

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s/);
    if (!match) continue;

    const currentLevel = match[1].length;

    if (currentLevel === 1) {
      // H1 — reset expectation (only one H1 allowed, but we don't change it)
      expectedLevel = 2;
      continue;
    }

    // Check for level skipping
    if (currentLevel > expectedLevel) {
      // Skipped a level — demote to expected level
      const newHashes = '#'.repeat(expectedLevel);
      lines[i] = lines[i].replace(/^#{1,6}\s/, newHashes + ' ');
    }

    // Update expected level for next heading
    expectedLevel = Math.max(2, currentLevel > expectedLevel ? expectedLevel : currentLevel + 1);
  }

  return lines.join('\n');
}
