const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['.expo-dist/**', 'assets/airports.db'],
    rules: {
      'import/order': 'off'
    }
  }
]);
