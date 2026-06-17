#!/usr/bin/env node

require('dotenv').config();
const { MongoClient } = require('mongodb');

const INDEX_NAME = 'refreshTokens.createdAt_1';
const INDEX_KEY = { 'refreshTokens.createdAt': 1 };
const EXPIRE_AFTER_SECONDS = 2592000;

const hasConfirmFlag = process.argv.includes('--confirm');

const sameKey = (actualKey) =>
  actualKey &&
  Object.keys(actualKey).length === 1 &&
  actualKey['refreshTokens.createdAt'] === INDEX_KEY['refreshTokens.createdAt'];

const describeIndex = (index) => ({
  name: index?.name,
  key: index?.key,
  expireAfterSeconds: index?.expireAfterSeconds,
});

const main = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required.');
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();

  try {
    const db = client.db();
    const users = db.collection('users');
    const indexes = await users.indexes();
    const target = indexes.find(
      (index) => index.name === INDEX_NAME || sameKey(index.key)
    );

    console.log(
      JSON.stringify(
        {
          database: db.databaseName,
          collection: 'users',
          dryRun: !hasConfirmFlag,
          targetIndex: describeIndex(target),
        },
        null,
        2
      )
    );

    if (!target) {
      console.log('No refresh token TTL index found. Nothing to drop.');
      return;
    }

    const isDangerousRefreshTokenTtl =
      target.name === INDEX_NAME &&
      sameKey(target.key) &&
      target.expireAfterSeconds === EXPIRE_AFTER_SECONDS;

    if (!isDangerousRefreshTokenTtl) {
      throw new Error(
        `Refusing to drop index because it does not exactly match ${INDEX_NAME} with expireAfterSeconds=${EXPIRE_AFTER_SECONDS}.`
      );
    }

    if (!hasConfirmFlag) {
      console.log(
        'Dry run only. Re-run with `npm run db:drop-dangerous-user-ttl-index -- --confirm` to drop this exact index.'
      );
      return;
    }

    await users.dropIndex(INDEX_NAME);
    console.log(`Dropped dangerous users index: ${INDEX_NAME}`);
  } finally {
    await client.close();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
