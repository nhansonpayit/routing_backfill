import { MongoClient } from 'mongodb';
import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const MONGODB_USERNAME = '';
const MONGODB_PASSWORD = '';
const MONGODB_PORT = -1;

const DOCDB_USERNAME = '';
const DOCDB_PASSWORD = '';
const DOCDB_PORT = -1;

const MONGODB_CONNECTION_STRING = `mongodb://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@localhost:${MONGODB_PORT}/?serverSelectionTimeoutMS=5000&connectTimeoutMS=10000&authSource=admin&authMechanism=SCRAM-SHA-1`;
const DOCDB_CONNECTION_STRING = `mongodb://${DOCDB_USERNAME}:${DOCDB_PASSWORD}@localhost:${DOCDB_PORT}/?ssl=true&serverSelectionTimeoutMS=5000&connectTimeoutMS=10000&authSource=admin&authMechanism=SCRAM-SHA-1`;
async function databaseConnections(): Promise<[MongoClient, MongoClient]> {
  const mongoConn = MongoClient.connect(MONGODB_CONNECTION_STRING, {
  }).then((conn) => {
    console.log('Connected to mongo!');
    return conn;
  });

  const docDbConn = MongoClient.connect(DOCDB_CONNECTION_STRING, {
    ssl: true,
    tlsAllowInvalidHostnames: true,
    authSource: 'admin',
    sslCA: '/Users/nh/rds-combined-ca-bundle.pem',
    directConnection: true,
  }).then((conn) => {
    console.log('Connected to docDb!');
    return conn;
  });

  return Promise.all([
    mongoConn,
    docDbConn,
  ]);
}

async function backfillRoutingInformation() {
  const [mongodbconn, docdb] = await databaseConnections();
  const BTPS = mongodbconn.db('braintree_payment_service');
  const PAS = docdb.db('payment-account-service');
  const routingInformationBtps = BTPS.collection('RoutingInformation').find<{ id: string }>({});
  const BTPSDocumentCount = await BTPS.collection('RoutingInformation').estimatedDocumentCount();
  const PASDocumentCount = await PAS.collection('RoutingInformationEntity').estimatedDocumentCount();

  console.log(`BTPS contains ${BTPSDocumentCount} items.`);
  console.log(`PAS contains ${PASDocumentCount} items.`);

  rl.question('continue? ', async (answer) => {
    if (!answer.match(/^[yY]$/)) {
      console.log('stopping!');
      await mongodbconn.close();
      await docdb.close();
      process.exit(1);
    }

    if (PASDocumentCount !== 0) {
      throw Error('PAS already has data in RoutingInformationEntity');
    }

    await routingInformationBtps.toArray().then(async (btpsData) => {
      const insertOp = await PAS.collection('RoutingInformationEntity').insertMany(btpsData, {
        ordered: true,
      });
      console.log(`${insertOp.insertedCount} documents were inserted into PAS`);
    });
    await mongodbconn.close();
    await docdb.close();
    process.exit(0);
  });
}

backfillRoutingInformation();
