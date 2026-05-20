import * as Crypto from 'expo-crypto';

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range';

export const getPasswordBreachCount = async (password: string): Promise<number | null> => {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA1,
    password,
  );
  const upperHash = hash.toUpperCase();
  const prefix = upperHash.slice(0, 5);
  const suffix = upperHash.slice(5);

  try {
    const response = await fetch(`${HIBP_RANGE_URL}/${prefix}`, {
      headers: {
        'Add-Padding': 'true',
      },
    });

    if (!response.ok) {
      return null;
    }

    const body = await response.text();
    const match = body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(`${suffix}:`));

    if (!match) {
      return 0;
    }

    const count = Number(match.split(':')[1]);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
};
