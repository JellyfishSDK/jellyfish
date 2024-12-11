const config = require('./jest.config.js')

module.exports = {
  ...config,
  testRegex: '((\\.|/)(defid))\\.ts$',
  testPathIgnorePatterns: [],
  testTimeout: 300000
}
