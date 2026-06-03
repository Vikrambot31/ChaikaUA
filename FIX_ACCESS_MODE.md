# Обновление режима контроля доступа в Firebase

## Текущее состояние:
- **Админ-панель показывает:** Система включена в режиме "soft"
- **Реальное состояние приложения:** Система отключена, все аутентифицированные пользователи имеют ПОЛНЫЙ доступ

## Почему несоответствие:
В коммите `24c0cb1 — Disable all access control restrictions` были отключены все ограничения доступа:
- Компонент `SoftInviteAccessGate.tsx` выдаёт полный доступ любому залогиненному пользователю
- Firebase содержит старое значение `mode: 'soft'` в файле конфигурации
- Админ-панель просто читает это старое значение

## Как исправить:

### Способ 1: Через Firebase Console (быстро)
1. Откройте https://console.firebase.google.com
2. Перейдите в **Realtime Database** → **chaikaua-3cd9d**
3. Найдите путь: `feature_flags/invite_access/current`
4. Отредактируйте значение:

```json
{
  "enabled": false,
  "mode": "disabled",
  "updatedAt": 1748000000000,
  "updatedBy": "admin-manual-fix",
  "version": 1
}
```

### Способ 2: Через Node.js скрипт
```bash
node update-access-mode.js
```

Требует:
- `firebase-admin` установлен
- `serviceAccountKey.json` в корне проекта

### Способ 3: Через CLI (если доступна Firebase CLI)
```bash
firebase database:set feature_flags/invite_access/current '{
  "enabled": false,
  "mode": "disabled",
  "updatedAt": '$(date +%s000)',
  "updatedBy": "system-update",
  "version": 1
}'
```

## После обновления:
- Администратор обновит страницу админ-панели
- На статус-баре будет показано: "Система выкл" (вместо "вкл · SOFT")
- Информация будет соответствовать действительности
