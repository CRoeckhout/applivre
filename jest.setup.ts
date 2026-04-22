/* eslint-disable @typescript-eslint/no-var-requires */

// Mock expo-crypto : Crypto.randomUUID en pseudo-UUID déterministe pour tests
jest.mock('expo-crypto', () => ({
  randomUUID: () => {
    const seg = () => Math.random().toString(16).slice(2, 6);
    return `${seg()}${seg()}-${seg()}-4${seg().slice(1)}-${seg()}-${seg()}${seg()}${seg()}`;
  },
}));

// Mock AsyncStorage via le mock officiel du package
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
