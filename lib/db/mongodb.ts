import { MongoClient, ServerApiVersion } from "mongodb";

let clientPromise: Promise<MongoClient> | undefined;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const getUri = (): string => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  return uri;
};

export const getMongoClient = (): Promise<MongoClient> => {
  if (clientPromise) {
    return clientPromise;
  }

  const uri = getUri();

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
      });
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    clientPromise = client.connect();
  }

  return clientPromise;
};

export const getMongoDatabase = async (dbName?: string) => {
  const client = await getMongoClient();
  return client.db(dbName ?? process.env.MONGODB_DB ?? "shorts-generator");
};
