import { safeOpenMaps } from './communicationActions';

export function buildGoogleMapsSearchUrl(name: string, address?: string): string {
  const query = [name, address, 'Ірпінь'].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

export function openInGoogleMaps(name: string, address?: string): void {
  const url = buildGoogleMapsSearchUrl(name, address);
  void safeOpenMaps(url);
}
