import * as fs from 'fs';
import * as path from 'path';
import { ProjectFile } from './types';

function to_posix(relPath: string): string {
  return relPath.split(path.sep).join('/');
}

export function list_project_files(projectRoot: string, excludeDirNames: string[]): ProjectFile[] {
  const files: ProjectFile[] = [];
  const exclude = new Set(excludeDirNames);

  function walk(absDir: string): void {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.DS_Store') {
        continue;
      }

      const absPath = path.join(absDir, entry.name);
      const relPath = to_posix(path.relative(projectRoot, absPath));

      if (entry.isDirectory()) {
        if (exclude.has(entry.name)) {
          continue;
        }
        walk(absPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(absPath).size;
      } catch {
        // ignore unreadable
        continue;
      }

      files.push({
        path: absPath,
        relativePath: relPath,
        sizeBytes
      });
    }
  }

  walk(projectRoot);
  return files;
}

export function maybe_read_text(file: ProjectFile, maxBytes: number): string | undefined {
  if (file.sizeBytes > maxBytes) {
    return undefined;
  }

  try {
    const buf = fs.readFileSync(file.path);

    // crude binary sniff
    if (buf.includes(0)) {
      return undefined;
    }

    return buf.toString('utf8');
  } catch {
    return undefined;
  }
}

export function compile_regexes(regexes: string[]): RegExp[] {
  return regexes.map(r => new RegExp(r, 'i'));
}

export function is_excluded_by_regex(relPath: string, regexes: RegExp[]): boolean {
  return regexes.some(r => r.test(relPath));
}
