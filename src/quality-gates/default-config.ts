import { QualityGatesConfig } from './types';

export const DEFAULT_QUALITY_GATES_CONFIG: QualityGatesConfig = {
  enabled: true,
  failOnIssues: true,
  autoAddRefactorStepOnDuplicateBlocks: true,
  autoAddReadmeTruthStepOnReadmeClaims: true,
  autoAddScaffoldFixStepOnScaffoldDefaults: true,
  autoAddConfigFixStepOnHardcodedConfig: true,
  excludeDirNames: [
    '.git',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.turbo',
    '.cache',
    '.context',
    '.locks',
    'runs',
    'plans',
    'proof',
    '.quickfix'
  ],
  maxFileSizeBytes: 512 * 1024,
  gates: {
    scaffoldDefaults: {
      enabled: true,
      bannedTitleRegexes: [
        'Vite \\+ React',
        'React App',
        'Next\\.js App',
        'SvelteKit'
      ],
      bannedReadmeRegexes: [
        'This project was bootstrapped with',
        'Vite\\s+\\+\\s+React',
        'Create React App'
      ],
      bannedFiles: [
        'public/vite.svg',
        'src/logo.svg',
        'public/favicon.ico'
      ]
    },
    duplicateBlocks: {
      enabled: true,
      minLines: 12,
      maxOccurrences: 2,
      maxFindings: 20,
      excludeFileRegexes: [
        '^package-lock\\.json$',
        '^pnpm-lock\\.yaml$',
        '^yarn\\.lock$',
        '^dist/',
        '^build/',
        '^coverage/',
        '^runs/',
        '^plans/',
        '^proof/'
      ]
    },
    hardcodedConfig: {
      enabled: true,
      bannedLiteralRegexes: [
        'https?://localhost(?::\\d+)?',
        'https?://127\\.0\\.0\\.1(?::\\d+)?',
        'RETRY_COUNT\\s*=\\s*[0-9]+'
      ],
      allowIfFileContainsRegexes: [
        'process\\.env\\.',
        'import\\.meta\\.env',
        'window\\.__CONFIG__'
      ],
      excludeFileRegexes: [
        '^\\.github/agents/',
        '\\.(md|mdx)$',
        '^dist/',
        '^build/',
        '^coverage/',
        '^runs/',
        '^plans/',
        '^proof/',
        'vite\\.config\\.(js|ts|mjs|mts)$',
        'webpack\\.config\\.(js|ts)$',
        '\\.env(\\.example|\\.local)?$'
      ]
    },
    readmeClaims: {
      enabled: true,
      claimRules: [
        {
          id: 'claim-retry',
          readmeRegex: '\\b(retry|retries|backoff|exponential backoff)\\b',
          requiredEvidence: [
            { fileRegex: 'src/.+', contentRegex: '\\bretry\\b', note: 'expected a retry helper or implementation' }
          ]
        },
        {
          id: 'claim-optimistic-ui',
          readmeRegex: '\\boptimistic\\b',
          requiredEvidence: [
            { fileRegex: 'src/.+', contentRegex: '\\boptimistic\\b', note: 'expected optimistic UI implementation' }
          ]
        },
        {
          id: 'claim-correlation-id',
          readmeRegex: '\\bcorrelation id\\b|\\bx-correlation-id\\b',
          requiredEvidence: [
            { fileRegex: 'src/.+', contentRegex: 'x-correlation-id|correlationId', note: 'expected correlation ID support in code' }
          ]
        },
        {
          id: 'claim-request-logging',
          readmeRegex: '\\brequest logging\\b|\\blog requests\\b',
          requiredEvidence: [
            { fileRegex: 'src/.+', contentRegex: 'req\\.method|morgan', note: 'expected request logging middleware' }
          ]
        }
      ]
    },
    testIsolation: {
      enabled: true,
      mutableStoreRegexes: [
        '^\\s*let\\s+\\w+\\s*=\\s*\\[\\s*\\]\\s*;\\s*$',
        '^\\s*let\\s+\\w+\\s*=\\s*\\{\\s*\\}\\s*;\\s*$'
      ],
      allowIfFileContainsRegexes: [
        'resetForTests',
        '__reset',
        'clearAll',
        'beforeEach\\('
      ],
      testFileRegexes: [
        '^(test|tests)/.+\\.test\\.(ts|js|tsx|jsx)$',
        '^__tests__/.+\\.(ts|js|tsx|jsx)$',
        '\\.test\\.(ts|js|tsx|jsx)$',
        '\\.spec\\.(ts|js|tsx|jsx)$'
      ],
      allowIfAnyTestContainsRegexes: [
        'beforeEach\\(',
        'afterEach\\('
      ]
    },
    runtimeChecks: {
      enabled: false,
      retries: 1,
      runTests: true,
      runLint: true,
      runAudit: true,
      timeoutMs: 120000
    }
  }
};
