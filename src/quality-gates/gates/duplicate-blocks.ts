import * as crypto from 'crypto';
import { compile_regexes, is_excluded_by_regex, maybe_read_text } from '../file-utils';
import { DuplicateBlocksConfig, GateContext, GateIssue, GateResult } from '../types';

type Occurrence = {
  filePath: string;
  startLine: number;
  lines: string[];
};

function normalize_block(lines: string[]): string {
  return lines
    .map(l => l.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

function hash_block(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex');
}

export async function run_duplicate_blocks_gate(
  ctx: GateContext,
  config: DuplicateBlocksConfig,
  maxFileSizeBytes: number
): Promise<GateResult> {
  const start = Date.now();
  const issues: GateIssue[] = [];

  const exclude = compile_regexes(config.excludeFileRegexes);
  const blocks = new Map<string, Occurrence[]>();

  for (const file of ctx.files) {
    if (is_excluded_by_regex(file.relativePath, exclude)) {
      continue;
    }

    const text = maybe_read_text(file, maxFileSizeBytes);
    if (!text) {
      continue;
    }

    // ignore tiny files
    const lines = text.split('\n');
    if (lines.length < config.minLines) {
      continue;
    }

    // blocks separated by blank lines (simple and deterministic)
    let current: { startLine: number; lines: string[] } | null = null;

    const flush = () => {
      if (!current) return;
      const cleaned = current.lines.filter(l => l.trim() !== '');
      if (cleaned.length >= config.minLines) {
        const normalized = normalize_block(cleaned);
        if (normalized.length > 0) {
          const h = hash_block(normalized);
          const occ: Occurrence = {
            filePath: file.relativePath,
            startLine: current.startLine,
            lines: cleaned
          };
          const existing = blocks.get(h) || [];
          existing.push(occ);
          blocks.set(h, existing);
        }
      }
      current = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const isBlank = line.trim() === '';

      if (isBlank) {
        flush();
        continue;
      }

      if (!current) {
        current = { startLine: i + 1, lines: [] };
      }

      current.lines.push(line);
    }

    flush();
  }

  // report duplicates
  const duplicates = Array.from(blocks.values())
    .filter(occ => occ.length > config.maxOccurrences);

  duplicates.sort((a, b) => b.length - a.length);

  for (const occs of duplicates.slice(0, config.maxFindings)) {
    const first = occs[0];
    if (!first) continue;

    issues.push({
      message: `duplicate code block (${occs.length} occurrences, ${first.lines.length} lines)`,
      filePath: first.filePath,
      line: first.startLine,
      excerpt: first.lines.slice(0, 6).join('\n') + (first.lines.length > 6 ? '\n…' : ''),
      hint: 'extract to a shared util/hook/middleware and reuse it'
    });

    // add a few more locations
    for (const extra of occs.slice(1, 3)) {
      issues.push({
        message: 'duplicate also appears here',
        filePath: extra.filePath,
        line: extra.startLine,
        excerpt: extra.lines.slice(0, 3).join('\n') + (extra.lines.length > 3 ? '\n…' : ''),
      });
    }

    if (issues.length >= config.maxFindings) {
      break;
    }
  }

  const durationMs = Date.now() - start;
  const status: GateResult['status'] = issues.length > 0 ? 'fail' : 'pass';

  return {
    id: 'duplicate-blocks',
    title: 'Duplicate code blocks under control',
    status,
    durationMs,
    issues,
    stats: {
      uniqueBlocks: blocks.size,
      duplicateGroups: duplicates.length,
      issues: issues.length
    }
  };
}
