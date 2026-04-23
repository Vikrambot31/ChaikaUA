export const OFFERS_FEEDS = [
  'https://fora.ua/all-offers',
];

export function buildOffersDigest() {
  return {
    title: 'Акції та знижки для Чайки',
    summary: 'Перевіряйте актуальні пропозиції у магазинах поруч із домом. Це короткий дайджест корисних знижок для щоденних покупок.',
    source: 'Фора',
    link: 'https://fora.ua/all-offers',
  };
}
