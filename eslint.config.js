import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      '**/crates/**',
      '**/Public/**',
      '**/.antigravity/**',
      'scratch/**',
      'tests/**',
      'vite.config.ts',
      'scripts/**',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // Hard constraint: Maximum 250 lines of code per file (excluding blanks and comments)
      'max-lines': [
        'error',
        {
          max: 250,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
  // Legacy debt baseline: Existing monolithic files prior to auditor guardrail adoption
  // Strictly frozen; no new files may be added to this allowlist
  {
    files: [
      'src/sieve.ts',
      'src/workers/pool.ts',
      'src/workers/protocol.ts',
      'src/workers/sieve.worker.ts',
      'src/utils/csvParser.ts',
      'src/utils/executiveAnalytics.ts',
      'src/state/useSieveStore.ts',
      'src/crypto/pii_scrubber.ts',
      'src/crypto/privacy_monitor.ts',
      'src/components/reports/ReportConfigModal.tsx',
      'src/components/privacy/PrivacyBadgeModal.tsx',
      'src/components/export/ExportDefModal.tsx',
      'src/components/dashboard/AnalyticalDrawer.tsx',
      'src/components/analytics/PowerQueryDrawer.tsx',
    ],
    rules: {
      'max-lines': 'off',
    },
  },
  // Boundary Rule 1: src/types/ cannot import from components, workers, analytics, or React
  {
    files: ['src/types/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'Architectural Boundary Violation: Domain types must never import React.',
            },
            {
              name: 'react-dom',
              message: 'Architectural Boundary Violation: Domain types must never import React DOM.',
            },
            {
              name: 'react-dom/client',
              message: 'Architectural Boundary Violation: Domain types must never import React DOM.',
            },
            {
              name: 'react/jsx-runtime',
              message: 'Architectural Boundary Violation: Domain types must never import React JSX runtime.',
            },
          ],
          patterns: [
            {
              group: [
                'react',
                'react/*',
                '**/components/**',
                '**/components/*',
                '../components/**',
                '../components/*',
                '**/workers/**',
                '**/workers/*',
                '../workers/**',
                '../workers/*',
                '**/analytics/**',
                '**/analytics/*',
                '../analytics/**',
                '../analytics/*',
              ],
              message: 'Architectural Boundary Violation: Domain types cannot import from presentation (components), workers, analytics, or React.',
            },
          ],
        },
      ],
    },
  },
  // Boundary Rule 2: src/workers/ cannot import window, document, or React modules
  {
    files: ['src/workers/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'Architectural Boundary Violation: Workers cannot import React modules.',
            },
            {
              name: 'react-dom',
              message: 'Architectural Boundary Violation: Workers cannot import React DOM.',
            },
            {
              name: 'react-dom/client',
              message: 'Architectural Boundary Violation: Workers cannot import React DOM.',
            },
            {
              name: 'window',
              message: 'Architectural Boundary Violation: Workers cannot import window.',
            },
            {
              name: 'document',
              message: 'Architectural Boundary Violation: Workers cannot import document.',
            },
          ],
          patterns: [
            {
              group: [
                'react',
                'react/*',
                '**/components/**',
                '**/components/*',
                '../components/**',
                '../components/*',
              ],
              message: 'Architectural Boundary Violation: Workers cannot import React modules or UI components.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Identifier[name="window"]:not(UnaryExpression[operator="typeof"] > Identifier)',
          message: 'Architectural Boundary Violation: Web Workers execute off the main thread and cannot access DOM "window".',
        },
        {
          selector: 'Identifier[name="document"]:not(UnaryExpression[operator="typeof"] > Identifier)',
          message: 'Architectural Boundary Violation: Web Workers execute off the main thread and cannot access DOM "document".',
        },
      ],
    },
  },
  // Boundary Rule 3: Domain layer (src/utils/, src/formatters/, src/presets/) cannot import presentation components or UI frameworks
  {
    files: [
      'src/utils/**/*.{ts,tsx}',
      'src/formatters/**/*.{ts,tsx}',
      'src/presets/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'Architectural Boundary Violation: Domain logic cannot import React.',
            },
            {
              name: 'react-dom',
              message: 'Architectural Boundary Violation: Domain logic cannot import React DOM.',
            },
          ],
          patterns: [
            {
              group: [
                '**/components/**',
                '../components/**',
                '../../components/**',
              ],
              message: 'Architectural Boundary Violation: Domain logic cannot depend on Presentation components.',
            },
          ],
        },
      ],
    },
  }
);
