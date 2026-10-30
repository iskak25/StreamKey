# StreamKey — база Firebase

| Окружение | Проект Firebase | Firestore | Регион |
|---|---|---|---|
| dev | `streamkey-dev` | Standard, `(default)` | `europe-west3` (Франкфурт) |
| test | — (создать позже) | | `europe-west3` |
| prod | — (создать позже) | | `europe-west3` |

Регион базы после создания не меняется — для test и prod выбирать тот же.

## Что в комплекте

- `firestore.rules` — deny-all: клиент не читает и не пишет данные, всё через Admin SDK (ТЗ 13.3).
- `firestore.indexes.json` — 13 составных индексов (ТЗ 13.1), отключённые одиночные индексы
  для `purgeAt`, `encryptedReceipt`, `description`, `before/after` и др. (ТЗ 13.2),
  TTL-политики на `purgeAt` для `sessions`, `access_links`, `idempotency`, `audit_logs`, `auth_jobs` (ТЗ 15.2).
- `firebase.json`, `.firebaserc` — привязка к `streamkey-dev` и настройки эмуляторов.
- `src/lib/server/schema.ts` — Zod-схемы и типы всех коллекций (ТЗ 10).
- `src/lib/server/firebase-admin.ts` — инициализация Admin SDK (только сервер).
- `scripts/bootstrap-super-admin.ts` — одноразовое создание первого SUPER_ADMIN (ТЗ 4.4).

## Развёртывание правил, индексов и TTL

```bash
npm i -g firebase-tools
firebase login
firebase deploy --only firestore --project streamkey-dev
```

Сборка индексов занимает несколько минут — статус во вкладке Firestore → Indexes.
TTL-политики видны в Firestore → TTL (или `gcloud firestore fields ttls list`).
Если консоль сообщит, что TTL требует тарифа Blaze, — без него документы просто не
удаляются автоматически; на доступ это не влияет, т.к. сервер всегда проверяет `expiresAt`.

## Локальная разработка

```bash
npm i -D firebase-tools
firebase emulators:start --only firestore,auth
```

## Первый SUPER_ADMIN

1. Войти в приложение через Google нужным аккаунтом (создастся `users/{uid}` с ролью USER).
2. Узнать UID в Firebase → Authentication.
3. `BOOTSTRAP_ALLOWED=1 FIREBASE_PROJECT_ID=streamkey-dev npx tsx scripts/bootstrap-super-admin.ts <UID>`
4. Убрать `BOOTSTRAP_ALLOWED` из окружения.

## Ещё не сделано в консоли

- Authentication → Sign-in method → Google (включить).
- Project settings → добавить Web-приложение и взять конфиг для `NEXT_PUBLIC_*`.
- Service account для сервера с минимальной ролью `Cloud Datastore User` (не Owner) — ключ в секреты Vercel.
