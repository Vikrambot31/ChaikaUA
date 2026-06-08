import { CommunityPhoto } from '../types/app';

const makeSeedPhoto = (id: string, imageUri: number, title: string): CommunityPhoto => ({
  id,
  title,
  description: 'Архивное фото ЖК Чайка.',
  imageUri,
  uploadedBy: 'Chaika archive',
  createdAt: new Date('2025-01-01T00:00:00.000Z').getTime(),
  status: 'approved',
  likes: 0,
});

export const CHAIKA_GALLERY_SEED: CommunityPhoto[] = [
  makeSeedPhoto('seed-01', require('../../assets/Chaika foto galary/cg01.jpg'), 'Чайка 01'),
  makeSeedPhoto('seed-02', require('../../assets/Chaika foto galary/cg02.jpg'), 'Чайка 02'),
  makeSeedPhoto('seed-03', require('../../assets/Chaika foto galary/cg03.jpg'), 'Чайка 03'),
  makeSeedPhoto('seed-04', require('../../assets/Chaika foto galary/cg04.jpg'), 'Чайка 04'),
  makeSeedPhoto('seed-05', require('../../assets/Chaika foto galary/cg05.jpg'), 'Чайка 05'),
  makeSeedPhoto('seed-06', require('../../assets/Chaika foto galary/cg06.jpg'), 'Чайка 06'),
  makeSeedPhoto('seed-07', require('../../assets/Chaika foto galary/cg07.jpg'), 'Чайка 07'),
  makeSeedPhoto('seed-08', require('../../assets/Chaika foto galary/cg08.jpg'), 'Чайка 08'),
  makeSeedPhoto('seed-09', require('../../assets/Chaika foto galary/cg09.jpg'), 'Чайка 09'),
  makeSeedPhoto('seed-10', require('../../assets/Chaika foto galary/cg10.jpg'), 'Чайка 10'),
  makeSeedPhoto('seed-11', require('../../assets/Chaika foto galary/cg11.jpg'), 'Чайка 11'),
];
