import { CommunityPhoto, HelpRequest } from '../types/app';

export const demoCommunityPhotos: CommunityPhoto[] = [
  {
    id: 'photo-1',
    title: 'Весняна алея біля будинку',
    description: 'Фото від сусідів: зелений двір після прибирання.',
    imageUri: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
    uploadedBy: 'Олена',
    createdAt: new Date('2026-04-08T10:20:00Z').getTime(),
    status: 'approved',
    likes: 18,
  },
  {
    id: 'photo-2',
    title: 'Тренувальний запис для <>45@0FVW',
    description: 'Очікує перевірки модератора перед додаванням у галерею.',
    imageUri: 'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
    uploadedBy: 'Ігор',
    createdAt: new Date('2026-04-09T09:10:00Z').getTime(),
    status: 'pending',
    likes: 4,
  },
];

const endOfDay = (hour = 23, minute = 59) => {
  const date = new Date();
  date.setHours(hour, minute, 59, 999);
  return date;
};

export const demoHelpRequests: HelpRequest[] = [
  {
    id: 'help-1',
    name: 'Олена',
    phone: '+380671234111',
    description: 'Потрібно допомогти занести пакети з магазину додому.',
    createdAt: new Date().toISOString(),
    expiresAt: endOfDay().toISOString(),
    isBurning: true,
  },
  {
    id: 'help-2',
    name: 'Ігор',
    phone: '+380501112233',
    description: 'Шукаю людину, яка підкаже дорогу до спортивного комплексу.',
    createdAt: new Date().toISOString(),
    expiresAt: endOfDay().toISOString(),
    isBurning: true,
  },
  {
    id: 'help-3',
    name: 'Марія',
    phone: '+380931112244',
    description: 'Потрібна коротка допомога з доставкою ліків для сусідки.',
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    expiresAt: endOfDay().toISOString(),
    isBurning: false,
  },
];


