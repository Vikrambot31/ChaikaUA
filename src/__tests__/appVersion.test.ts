jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.1.5',
      extra: {},
    },
  },
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.1.5',
}));

import { compareVersions } from '../services/appVersion';

describe('appVersion helpers', () => {
  it('treats equal semantic versions as equal', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('detects when current version is lower', () => {
    expect(compareVersions('1.2.2', '1.2.3')).toBe(-1);
  });

  it('detects when current version is higher', () => {
    expect(compareVersions('1.3.0', '1.2.9')).toBe(1);
  });

  it('ignores non-digit suffixes safely', () => {
    expect(compareVersions('1.2.3-beta', '1.2.3')).toBe(0);
  });
});
