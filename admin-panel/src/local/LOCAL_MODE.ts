// =============================================================
//  LOCAL_MODE (Admin Panel) — відключає Firebase для панелі адміна
//
//  Щоб повернутися в продакшн — змінити LOCAL_MODE на false
//  Локальний сервер: cd local-server && npm start   (порт 3001)
// =============================================================

export const LOCAL_MODE = false;

export const LOCAL_API = 'http://localhost:3001';

export type LocalUserRole = 'admin' | 'resident' | 'moderator' | 'guest' | 'pending';

export const LOCAL_USERS: Record<LocalUserRole, { id: string; name: string; email: string; role: LocalUserRole }> = {
  admin:     { id: 'local-admin',   name: 'Vikram Admin',      email: 'admin@test.local',   role: 'admin' },
  resident:  { id: 'local-user-1',  name: 'Олена Іваненко',    email: 'elena@test.local',   role: 'resident' },
  moderator: { id: 'local-mod',     name: 'Мод Петренко',      email: 'mod@test.local',     role: 'moderator' },
  guest:     { id: 'local-guest',   name: 'Гість Користувач',  email: 'guest@test.local',   role: 'guest' },
  pending:   { id: 'local-pending', name: 'Новий Мешканець',   email: 'pending@test.local', role: 'pending' },
};

// Хелпер: GET
export async function localGet<T>(path: string): Promise<T> {
  const res = await fetch(`${LOCAL_API}${path}`);
  if (!res.ok) throw new Error(`localGet ${path} → ${res.status}`);
  return res.json();
}

// Хелпер: POST
export async function localPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${LOCAL_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`localPost ${path} → ${res.status}`);
  return res.json();
}

// Хелпер: PATCH
export async function localPatch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${LOCAL_API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`localPatch ${path} → ${res.status}`);
  return res.json();
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
