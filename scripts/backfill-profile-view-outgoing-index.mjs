import admin from 'firebase-admin';

const SOURCE_PATH = 'profileViewRequests';
const DEST_ROOT_PATH = 'outgoingProfileRequestsByUser';
const DEFAULT_EXAMPLES_LIMIT = 20;

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const eqIndex = arg.indexOf('=');
    if (eqIndex >= 0) {
      options[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
}

function asPositiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeForIndex(source, targetUid, requesterUid) {
  return {
    ...source,
    requesterId: requesterUid,
    requesterUserId: requesterUid,
    targetUserId: targetUid,
  };
}

function compareImportantFields(existing, desired) {
  const fields = ['requesterId', 'requesterUserId', 'targetUserId', 'status', 'requestedAt', 'createdAt'];
  return fields
    .filter((field) => existing?.[field] !== undefined || desired?.[field] !== undefined)
    .filter((field) => existing?.[field] !== desired?.[field]);
}

function pushExample(list, limit, value) {
  if (list.length < limit) {
    list.push(value);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apply = Boolean(options.apply);
  const examplesLimit = asPositiveInteger(options['examples-limit'], DEFAULT_EXAMPLES_LIMIT);
  const databaseURL = String(
    options['database-url'] ||
      process.env.FIREBASE_DATABASE_URL ||
      process.env.DATABASE_URL ||
      '',
  ).trim();

  if (!databaseURL) {
    throw new Error('Missing FIREBASE_DATABASE_URL, DATABASE_URL, or --database-url');
  }

  admin.initializeApp({ databaseURL });
  const db = admin.database();

  const stats = {
    scanned: 0,
    alreadyIndexed: 0,
    missingIndex: 0,
    created: 0,
    invalid: 0,
    mismatch: 0,
  };

  const invalidExamples = [];
  const mismatchExamples = [];
  const createdExamples = [];

  console.log('Profile view outgoing index backfill');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Source: ${SOURCE_PATH}/{targetUid}/{requesterUid}`);
  console.log(`Destination: ${DEST_ROOT_PATH}/{requesterUid}/{targetUid}`);
  console.log('');

  const sourceSnapshot = await db.ref(SOURCE_PATH).once('value');
  const sourceRoot = sourceSnapshot.val();
  const destinationSnapshot = await db.ref(DEST_ROOT_PATH).once('value');
  const destinationRoot = isRecord(destinationSnapshot.val()) ? destinationSnapshot.val() : {};

  if (!isRecord(sourceRoot)) {
    console.log('No source records found.');
    console.log('');
    console.log('--- Summary ---');
    console.table(stats);
    return;
  }

  for (const [targetUidRaw, requestsByRequester] of Object.entries(sourceRoot)) {
    const targetUid = safeString(targetUidRaw);

    if (!targetUid || !isRecord(requestsByRequester)) {
      stats.invalid += 1;
      pushExample(invalidExamples, examplesLimit, {
        path: `${SOURCE_PATH}/${targetUidRaw}`,
        reason: !targetUid ? 'invalid_target_uid' : 'target_node_is_not_object',
      });
      continue;
    }

    for (const [requesterUidRaw, sourceValue] of Object.entries(requestsByRequester)) {
      stats.scanned += 1;
      const requesterUid = safeString(requesterUidRaw);

      if (!requesterUid || !isRecord(sourceValue)) {
        stats.invalid += 1;
        pushExample(invalidExamples, examplesLimit, {
          path: `${SOURCE_PATH}/${targetUidRaw}/${requesterUidRaw}`,
          reason: !requesterUid ? 'invalid_requester_uid' : 'request_node_is_not_object',
        });
        continue;
      }

      const desired = normalizeForIndex(sourceValue, targetUid, requesterUid);
      const destPath = `${DEST_ROOT_PATH}/${requesterUid}/${targetUid}`;
      const existing = isRecord(destinationRoot?.[requesterUid])
        ? destinationRoot[requesterUid][targetUid]
        : undefined;

      if (existing !== undefined && existing !== null) {
        const mismatchFields = isRecord(existing) ? compareImportantFields(existing, desired) : ['destination_not_object'];
        if (mismatchFields.length > 0) {
          stats.mismatch += 1;
          pushExample(mismatchExamples, examplesLimit, {
            sourcePath: `${SOURCE_PATH}/${targetUid}/${requesterUid}`,
            destPath,
            fields: mismatchFields,
            existing: isRecord(existing)
              ? {
                  requesterId: existing.requesterId,
                  requesterUserId: existing.requesterUserId,
                  targetUserId: existing.targetUserId,
                  status: existing.status,
                  requestedAt: existing.requestedAt,
                  createdAt: existing.createdAt,
                }
              : existing,
            desired: {
              requesterId: desired.requesterId,
              requesterUserId: desired.requesterUserId,
              targetUserId: desired.targetUserId,
              status: desired.status,
              requestedAt: desired.requestedAt,
              createdAt: desired.createdAt,
            },
          });
        } else {
          stats.alreadyIndexed += 1;
        }
        continue;
      }

      stats.missingIndex += 1;

      if (apply) {
        const result = await db.ref(destPath).transaction((current) => {
          if (current !== null) return;
          return desired;
        });
        if (result.committed) {
          stats.created += 1;
        } else {
          stats.alreadyIndexed += 1;
        }
      }

      pushExample(createdExamples, examplesLimit, {
        sourcePath: `${SOURCE_PATH}/${targetUid}/${requesterUid}`,
        destPath,
        action: apply ? 'created' : 'would_create',
      });
    }
  }

  console.log('--- Summary ---');
  console.table(stats);

  if (createdExamples.length > 0) {
    console.log(`--- ${apply ? 'Created' : 'Would create'} examples ---`);
    console.table(createdExamples);
  }

  if (mismatchExamples.length > 0) {
    console.log('--- Mismatch examples ---');
    console.dir(mismatchExamples, { depth: 5 });
  }

  if (invalidExamples.length > 0) {
    console.log('--- Invalid examples ---');
    console.table(invalidExamples);
  }

  if (!apply) {
    console.log('');
    console.log('Dry-run only. Re-run with --apply to create missing destination index records.');
  }
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(admin.apps.map((app) => app.delete().catch(() => undefined)));
  });
