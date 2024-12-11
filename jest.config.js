module.exports = {
  preset: 'ts-jest',
  testRegex: '((\\.|/)(e2e|test|spec))\\.[jt]sx?$',
  testSequencer: require.resolve('./jest.sequencer'),
  moduleNameMapper: {
    '@defichain/(.*)/dist/(.*)': '<rootDir>/packages/$1/src/$2',
    '@defichain/(.*)': '<rootDir>/packages/$1/src',

    // apps
    '@defichain-apps/libs/(.*)': '<rootDir>/apps/libs/$1/src'
  },
  verbose: true,
  clearMocks: true,
  testTimeout: 300000,
  testPathIgnorePatterns: [
    '__sanity__',
    '__defid__'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/examples/',
    '/website/',
    '.*/__tests__/.*',
    '.*/testing/.*'
  ]
}
