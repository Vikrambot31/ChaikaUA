# ТЗ-05: Admin Panel - перенос опасных записей на Cloud Functions

## Цель

Снизить зависимость безопасности от клиентской admin-panel. Опасные изменения должны проходить через Cloud Functions с серверной проверкой `context.auth.uid` и роли.

## Масштаб

Это большое системное ТЗ. Его лучше выполнять по одному сервису за раз, а не менять всю админку одним коммитом.

## Файлы для анализа

- `admin-panel/src/services/securityService.ts`
- `admin-panel/src/services/moderationService.ts`
- `admin-panel/src/services/inviteAccessService.ts`
- `admin-panel/src/services/guarantorTreeService.ts`
- `functions/index.js`
- `functions/inviteAccess.js`

## Задача 1: составить список прямых RTDB writes

Нужно найти все места в admin-panel, где используются:

- `set(...)`
- `update(...)`
- `remove(...)`
- прямые записи в `security_config`
- прямые записи в `authorized_devices`
- прямые записи в `user_roles`
- прямые записи в `trust_tree` или `user_access`

## Задача 2: выбрать первый безопасный сервис для переноса

Рекомендуемый порядок:

1. Moderation actions.
2. Security app control.
3. Device allow/block actions.
4. Trust tree and user access writes.

Не переносить все сразу, чтобы не потерять контроль качества.

## Задача 3: Cloud Function должна проверять роль

Каждая новая callable function должна:

- Требовать `context.auth`.
- Брать `actorUid` только из `context.auth.uid`.
- Читать роль пользователя из надежного источника.
- Разрешать действие только owner/admin/moderator в зависимости от операции.
- Валидировать payload.
- Писать audit log с серверным actor UID.

## Задача 4: клиент вызывает Cloud Function

В admin-panel заменить прямую запись на вызов Cloud Function.

UI должен:

- Показывать загрузку.
- Показывать понятную ошибку отказа.
- Не подставлять `actorUid` вручную.

## Проверка

- Обычный пользователь не может выполнить admin mutation.
- Moderator не может выполнить действие, которое разрешено только admin/owner.
- Audit log содержит реальный `context.auth.uid`.
- Старый UI работает после переноса одного сервиса.

## Что не делать

- Не менять owner-login одновременно с переносом mutations.
- Не удалять старые правила Firebase до проверки нового flow.
- Не делать массовый рефакторинг UI.
