const CAFE_SPOTS = [
  { name: 'BALCONE COFFEE', address: 'вулиця Валерія Лобановського, 26 к2', score: 9.6, imageUrl: 'https://chaika-ua.netlify.app/kaffee3.jpeg' },
  { name: '#МОЖЕКАВИ?', address: 'вулиця Валерія Лобановського, 29', score: 9.5, imageUrl: 'https://chaika-ua.netlify.app/kaffee3.jpeg' },
  { name: 'Coffee ART', address: 'вулиця Валерія Лобановського, 25', score: 9.4, imageUrl: 'https://chaika-ua.netlify.app/kaffee3.jpeg' },
  { name: 'ANMI SOUL', address: 'вулиця Валерія Лобановського, 18', score: 9.3, imageUrl: 'https://chaika-ua.netlify.app/kaffee3.jpeg' },
  { name: 'OBRIY cafe&bakery', address: 'вулиця Валерія Лобановського, 28', score: 9.2, imageUrl: 'https://chaika-ua.netlify.app/kaffee3.jpeg' },
  { name: 'Chaykava', address: 'вулиця Українського Відродження', score: 9.1, imageUrl: 'https://chaika-ua.netlify.app/kaffee3.jpeg' },
  { name: 'White Rabbit Coffee and Friends', address: 'вулиця Валерія Лобановського, 26 к2', score: 9.0, imageUrl: 'https://chaika-ua.netlify.app/kaffee3.jpeg' },
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

export function getPlacesPostOfDay() {
  const ordered = rotateByDay([...CAFE_SPOTS].sort((a, b) => b.score - a.score));
  const items = ordered.slice(0, 2);
  if (items.length < 2) return null;

  const imageUrl = items.find((item) => item.imageUrl)?.imageUrl || '';
  if (!imageUrl) return null;

  const text = [
    '📍 Два місця на Чайці, куди можна піти сьогодні',
    `1) ${items[0].name} — ${items[0].address}`,
    `2) ${items[1].name} — ${items[1].address}`,
    'Коротко: сьогодні радимо звернути увагу на ці два місця поруч із домом.',
    `Джерело: ${process.env.SITE_URL || 'ChaikaUA'}`,
    'Дякуємо, що користуєтеся додатком ЖК Чайка.',
    'Розкажіть свої новини та події в чаті у мобільному додатку.',
    `Скачати додаток: ${process.env.SITE_URL || 'https://chaika-ua.netlify.app'}`,
  ].join('\n\n');

  return {
    title: 'Два місця на Чайці, куди можна піти сьогодні',
    items,
    imageUrl,
    text,
  };
}
