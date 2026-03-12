import { maybe_read_text } from '../file-utils';
import { GateContext, GateIssue, GateResult, AccessibilityConfig } from '../types';

// Matches <h1> through <h6> tags in HTML content
const HEADING_REGEX = /<h([1-6])\b/gi;

export async function run_accessibility_gate(
  ctx: GateContext,
  config: AccessibilityConfig,
  maxFileSizeBytes: number
): Promise<GateResult> {
  const start = Date.now();
  const issues: GateIssue[] = [];

  const htmlFiles = ctx.files.filter(f => /\.html?$/i.test(f.relativePath));
  const jsxFiles = ctx.files.filter(f => /\.(jsx|tsx)$/i.test(f.relativePath));
  const cssFiles = ctx.files.filter(f => /\.css$/i.test(f.relativePath));
  const componentFiles = [...jsxFiles, ...ctx.files.filter(f => /\.(js|ts)$/i.test(f.relativePath) && !f.relativePath.startsWith('test'))];

  // 1. Check lang attribute on <html> in all .html files
  for (const file of htmlFiles) {
    const text = file.text ?? maybe_read_text(file, maxFileSizeBytes);
    if (!text) continue;

    if (/<html\b/i.test(text) && !/<html[^>]+lang\s*=/i.test(text)) {
      issues.push({
        message: `<html> element missing lang attribute`,
        filePath: file.relativePath,
        hint: 'add lang="en" (or appropriate language code) to the <html> tag'
      });
    }
  }

  // 2. Check for skip-to-content link
  if (config.requireSkipLink && htmlFiles.length > 0) {
    const hasSkipLink = htmlFiles.some(f => {
      const text = f.text ?? maybe_read_text(f, maxFileSizeBytes);
      if (!text) return false;
      return /skip-link|skip.to.content|#main-content/i.test(text);
    });

    // Also check JSX/TSX components for skip links
    const hasSkipLinkInJsx = jsxFiles.some(f => {
      const text = f.text ?? maybe_read_text(f, maxFileSizeBytes);
      if (!text) return false;
      return /skip-link|skip.to.content|#main-content/i.test(text);
    });

    if (!hasSkipLink && !hasSkipLinkInJsx) {
      issues.push({
        message: 'no skip-to-content link found in HTML or JSX files',
        hint: 'add <a href="#main-content" class="skip-link">Skip to content</a> as the first focusable element'
      });
    }
  }

  // 3. Check heading hierarchy
  if (config.requireHeadingHierarchy) {
    const allSourceFiles = [...htmlFiles, ...jsxFiles];
    for (const file of allSourceFiles) {
      const text = file.text ?? maybe_read_text(file, maxFileSizeBytes);
      if (!text) continue;

      const headings: number[] = [];
      let match: RegExpExecArray | null;
      const headingRegex = new RegExp(HEADING_REGEX.source, 'gi');
      while ((match = headingRegex.exec(text)) !== null) {
        headings.push(parseInt(match[1], 10));
      }

      if (headings.length === 0) continue;

      // First heading should be h1
      if (headings[0] !== 1) {
        issues.push({
          message: `first heading is <h${headings[0]}>, expected <h1>`,
          filePath: file.relativePath,
          hint: 'page should start with an <h1> element'
        });
      }

      // No skipped levels: h1 -> h3 without h2 in between
      for (let i = 1; i < headings.length; i++) {
        if (headings[i] > headings[i - 1] + 1) {
          issues.push({
            message: `heading level skips from <h${headings[i - 1]}> to <h${headings[i]}>`,
            filePath: file.relativePath,
            hint: `add an intermediate <h${headings[i - 1] + 1}> heading before <h${headings[i]}>`
          });
          break; // one issue per file is enough
        }
      }
    }
  }

  // 4. Check aria-label on interactive/landmark elements
  if (config.requireAriaLabels) {
    for (const file of jsxFiles) {
      const text = file.text ?? maybe_read_text(file, maxFileSizeBytes);
      if (!text) continue;

      // <nav> without aria-label
      if (/<nav\b/i.test(text) && !/<nav[^>]+aria-label/i.test(text)) {
        issues.push({
          message: '<nav> element missing aria-label',
          filePath: file.relativePath,
          hint: 'add aria-label="Main navigation" or similar'
        });
      }

      // <button> without aria-label and without visible text children
      // Only flag buttons that look like icon-only buttons (contain emoji or svg but no plain text)
      const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
      let btnMatch: RegExpExecArray | null;
      while ((btnMatch = buttonRegex.exec(text)) !== null) {
        const attrs = btnMatch[1];
        const content = btnMatch[2];
        const hasAriaLabel = /aria-label/i.test(attrs);
        // Button has meaningful text if it contains word characters outside tags
        const strippedContent = content.replace(/<[^>]+>/g, '').trim();
        const hasTextContent = /\w{2,}/.test(strippedContent);

        if (!hasAriaLabel && !hasTextContent) {
          issues.push({
            message: 'icon-only <button> missing aria-label',
            filePath: file.relativePath,
            excerpt: content.slice(0, 40),
            hint: 'add aria-label describing the button action'
          });
          break; // one per file
        }
      }
    }
  }

  // 5. Check for :focus-visible in CSS
  if (config.requireFocusStyles) {
    const hasFocusVisible = cssFiles.some(f => {
      const text = f.text ?? maybe_read_text(f, maxFileSizeBytes);
      if (!text) return false;
      return /:focus-visible/.test(text);
    });

    // Also check inline styles in JSX for focus handling
    const hasFocusInJsx = jsxFiles.some(f => {
      const text = f.text ?? maybe_read_text(f, maxFileSizeBytes);
      if (!text) return false;
      return /focus-visible|onFocus|:focus/.test(text);
    });

    if (!hasFocusVisible && !hasFocusInJsx && cssFiles.length > 0) {
      issues.push({
        message: 'no :focus-visible styles found in any CSS file',
        hint: 'add :focus-visible { outline: 2px solid <color>; outline-offset: 2px; } for interactive elements'
      });
    }

    // Check for outline: none/0 without replacement focus style
    for (const file of cssFiles) {
      const text = file.text ?? maybe_read_text(file, maxFileSizeBytes);
      if (!text) continue;

      if (/outline\s*:\s*(none|0)\b/.test(text) && !/outline\s*:\s*\d+px/.test(text.replace(/outline\s*:\s*(none|0)/g, ''))) {
        issues.push({
          message: 'outline: none found without replacement focus style',
          filePath: file.relativePath,
          hint: 'removing outline disables keyboard focus visibility; add an alternative focus indicator'
        });
      }
    }
  }

  const durationMs = Date.now() - start;
  const status: GateResult['status'] = issues.length > 0 ? 'fail' : 'pass';

  return {
    id: 'accessibility',
    title: 'Accessibility checks',
    status,
    durationMs,
    issues,
    stats: {
      htmlFiles: htmlFiles.length,
      jsxFiles: jsxFiles.length,
      cssFiles: cssFiles.length,
      issues: issues.length
    }
  };
}
