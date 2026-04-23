const CAFE_SPOTS = [
  { name: 'BALCONE COFFEE', address: 'вулиця Валерія Лобановського, 26 к2', score: 9.6, imageUrl: '' },
  { name: '#МОЖЕКАВИ?', address: 'вулиця Валерія Лобановського, 29', score: 9.5, imageUrl: '' },
  { name: 'Coffee ART', address: 'вулиця Валерія Лобановського, 25', score: 9.4, imageUrl: '' },
  { name: 'ANMI SOUL', address: 'вулиця Валерія Лобановського, 18', score: 9.3, imageUrl: '' },
  { name: 'OBRIY cafe&bakery', address: 'вулиця Валерія Лобановського, 28', score: 9.2, imageUrl: '' },
  { name: 'Chaykava', address: 'вулиця Українського Відродження', score: 9.1, imageUrl: '' },
  { name: 'White Rabbit Coffee and Friends', address: 'вулиця Валерія Лобановського, 26 к2', score: 9.0, imageUrl: '' },
];

function rotateByDay(items) {
  if (!items.length) return items;
  const day = new Date().getDate();
  const offset = day % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

export function getCoffeeSpotOfDay() {
  const ordered = rotateByDay([...CAFE_SPOTS].sort((a, b) => b.score - a.score));
  return ordered[0] || null;
}

export function getCoffeeSpotWithImage() {
  const spot = getCoffeeSpotOfDay();
  if (!spot || !spot.imageUrl) return null;
  return spot;
}
