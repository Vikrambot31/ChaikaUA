// =============================================================
//  LOCAL_MODE — повністю відключає Firebase, всі дані з localhost:3001
//
//  Щоб повернутися в продакшн — змінити LOCAL_MODE на false
//  Щоб запустити локальний сервер:
//    cd local-server && npm install && npm start
// =============================================================

import { Platform } from 'react-native';

export const LOCAL_MODE = false;

// Platform-aware URL:
//   - Web / iOS simulator → localhost:3001
//   - Android emulator   → 10.0.2.2:3001  (emulator routing до хоста)
//   - Реальный девайс    → замени на свой локальный IP, напр. 192.168.1.100:3001
const getLocalApiBase = (): string => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }
  return 'http://localhost:3001';
};

export const LOCAL_API = getLocalApiBase();

// Типы тестовых юзеров
export type LocalUserRole = 'admin' | 'resident' | 'moderator' | 'guest' | 'pending';

export const LOCAL_USERS: Record<LocalUserRole, { id: string; name: string; email: string; role: LocalUserRole; phone: string; building: string }> = {
  admin:     { id: 'local-admin',   name: 'Vikram Admin',      email: 'admin@test.local',   role: 'admin',     phone: '+380991234567', building: '17' },
  resident:  { id: 'local-user-1',  name: 'Олена Іваненко',    email: 'elena@test.local',   role: 'resident',  phone: '+380671234111', building: '14' },
  moderator: { id: 'local-mod',     name: 'Мод Петренко',      email: 'mod@test.local',     role: 'moderator', phone: '+380501112233', building: '10' },
  guest:     { id: 'local-guest',   name: 'Гість Користувач',  email: 'guest@test.local',   role: 'guest',     phone: '',             building: '' },
  pending:   { id: 'local-pending', name: 'Новий Мешканець',   email: 'pending@test.local', role: 'pending',   phone: '+380681239876', building: '3' },
};

// Хелпер: GET
export async function localGet<T>(path: string): Promise<T> {
  const res = await fetch(`${LOCAL_API}${path}`);
  if (!res.ok) throw new Error(`localGet ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Хелпер: POST
export async function localPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${LOCAL_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`localPost ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Хелпер: PATCH
export async function localPatch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${LOCAL_API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`localPatch ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Хелпер: DELETE
export async function localDelete(path: string): Promise<void> {
  const res = await fetch(`${LOCAL_API}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`localDelete ${path} → ${res.status}`);
}

// Переключить активного юзера
export async function switchLocalUser(role: LocalUserRole): Promise<void> {
  await localPatch('/currentUser', LOCAL_USERS[role]);
}

// Получить текущего юзера
export async function getCurrentLocalUser() {
  return localGet<{ id: string; name: string; email: string; role: LocalUserRole; phone: string; building: string }>('/currentUser');
}
