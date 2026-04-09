import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { list_project_files, parse_gitignore_dirs } from '../src/quality-gates';

describe('parse_gitignore_dirs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-utils-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty set when no .gitignore exists', () => {
    const result = parse_gitignore_dirs(tmpDir);
    assert.strictEqual(result.size, 0);
  });

  it('extracts simple directory names from .gitignore', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), [
      'venv',
      'node_modules/',
      '__pycache__',
      '.mypy_cache/',
    ].join('\n'));

    const result = parse_gitignore_dirs(tmpDir);
    assert.ok(result.has('venv'));
    assert.ok(result.has('node_modules'));
    assert.ok(result.has('__pycache__'));
    assert.ok(result.has('.mypy_cache'));
  });

  it('skips comments and blank lines', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), [
      '# Python artifacts',
      '',
      'venv/',
      '',
      '# IDE files',
      '.idea',
    ].join('\n'));

    const result = parse_gitignore_dirs(tmpDir);
    assert.strictEqual(result.size, 2);
    assert.ok(result.has('venv'));
    assert.ok(result.has('.idea'));
  });

  it('skips negation patterns', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), [
      'dist',
      '!dist/important',
    ].join('\n'));

    const result = parse_gitignore_dirs(tmpDir);
    assert.ok(result.has('dist'));
    assert.strictEqual(result.has('!dist'), false);
  });

  it('skips glob patterns and paths with slashes', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), [
      '*.pyc',
      '*.log',
      'build/output',
      'venv',
      '?temp',
    ].join('\n'));

    const result = parse_gitignore_dirs(tmpDir);
    // Only "venv" should be extracted; the others have globs or path separators
    assert.strictEqual(result.size, 1);
    assert.ok(result.has('venv'));
  });
});

describe('list_project_files', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'list-files-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('excludes directories in the hardcoded exclusion list', () => {
    // Simulate a project with venv and source files
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.py'), 'print("hello")');

    fs.mkdirSync(path.join(tmpDir, 'venv', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'venv', 'lib', 'huge.py'), 'x = 1');

    const files = list_project_files(tmpDir, ['venv']);
    const paths = files.map(f => f.relativePath);

    assert.ok(paths.includes('src/app.py'), 'should include source files');
    assert.ok(!paths.some(p => p.startsWith('venv/')), 'should exclude venv directory');
  });

  it('excludes directories found in .gitignore', () => {
    // Project has a .gitignore that excludes "myenv" (a custom venv name)
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'myenv\n');

    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'main.py'), 'pass');

    fs.mkdirSync(path.join(tmpDir, 'myenv', 'lib', 'python3.12', 'site-packages'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'myenv', 'lib', 'python3.12', 'site-packages', 'torch.py'), '# fake');

    // Empty exclude list; .gitignore should still cause myenv to be skipped
    const files = list_project_files(tmpDir, []);
    const paths = files.map(f => f.relativePath);

    assert.ok(paths.includes('src/main.py'), 'should include source files');
    assert.ok(paths.includes('.gitignore'), 'should include .gitignore itself');
    assert.ok(!paths.some(p => p.startsWith('myenv/')), 'should exclude myenv from .gitignore');
  });

  it('merges hardcoded and .gitignore exclusions', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'custom_env/\n');

    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export {}');

    // Both should be excluded
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg', 'index.js'), '');
    fs.mkdirSync(path.join(tmpDir, 'custom_env', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'custom_env', 'bin', 'activate'), '');

    const files = list_project_files(tmpDir, ['node_modules']);
    const paths = files.map(f => f.relativePath);

    assert.ok(paths.includes('src/index.ts'));
    assert.ok(!paths.some(p => p.startsWith('node_modules/')));
    assert.ok(!paths.some(p => p.startsWith('custom_env/')));
  });

  it('handles missing .gitignore gracefully', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'console.log("hi")');

    // No .gitignore; should not throw
    const files = list_project_files(tmpDir, []);
    assert.ok(files.length >= 1);
    assert.ok(files.some(f => f.relativePath === 'src/app.js'));
  });
});
