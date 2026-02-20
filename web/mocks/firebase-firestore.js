// Mock for @react-native-firebase/firestore on web
console.warn('⚠️ Using mock Firebase Firestore - Database features will not work on web until Firebase Web SDK is integrated');

// Create mock functions that match the React Native Firebase API
const createMockDoc = (id, data = {}) => ({
  id,
  data: () => data,
  exists: true,
  get: (field) => data[field],
  ref: { id, path: `mock/${id}` },
});

const createMockCollection = (path) => {
  const docs = [];
  return {
    id: path.split('/').pop(),
    path,
    docs,
    get: () => Promise.resolve({ docs: [] }),
    add: (data) => {
      const newDoc = createMockDoc(`mock-${Date.now()}`, data);
      docs.push(newDoc);
      return Promise.resolve(newDoc.ref);
    },
    doc: (id) => ({
      id: id || `mock-${Date.now()}`,
      get: () => Promise.resolve({ exists: false, data: () => null }),
      set: () => Promise.resolve(),
      update: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      collection: (subPath) => createMockCollection(`${path}/${id}/${subPath}`),
    }),
    where: (field, op, value) => ({
      get: () => Promise.resolve({ docs: [] }),
      where: function(f, o, v) { return this; },
      orderBy: function(f, d) { return this; },
      limit: function(n) { return this; },
    }),
    orderBy: (field, direction = 'asc') => ({
      get: () => Promise.resolve({ docs: [] }),
      where: function(f, o, v) { return this; },
      orderBy: function(f, d) { return this; },
      limit: function(n) { return this; },
    }),
    limit: (n) => ({
      get: () => Promise.resolve({ docs: [] }),
      where: function(f, o, v) { return this; },
      orderBy: function(f, d) { return this; },
      limit: function(n) { return this; },
    }),
  };
};

const mockDb = {
  collection: (path) => createMockCollection(path),
};

// Export functions matching React Native Firebase API
export const getFirestore = () => mockDb;

export const collection = (dbOrRef, ...pathSegments) => {
  if (pathSegments.length === 0) {
    return dbOrRef.collection ? dbOrRef.collection() : createMockCollection('mock');
  }
  const path = pathSegments.join('/');
  return dbOrRef.collection ? dbOrRef.collection(path) : createMockCollection(path);
};

export const doc = (collectionOrRef, ...pathSegments) => {
  if (pathSegments.length === 0) {
    return collectionOrRef.doc ? collectionOrRef.doc() : { id: 'mock', get: () => Promise.resolve({ exists: false }) };
  }
  const id = pathSegments[pathSegments.length - 1];
  return collectionOrRef.doc ? collectionOrRef.doc(id) : { id, get: () => Promise.resolve({ exists: false }) };
};

export const query = (...args) => {
  // Return a query-like object
  return {
    get: () => Promise.resolve({ docs: [] }),
  };
};

export const where = (field, operator, value) => ({
  get: () => Promise.resolve({ docs: [] }),
});

export const orderBy = (field, direction = 'asc') => ({
  get: () => Promise.resolve({ docs: [] }),
});

export const limit = (n) => ({
  get: () => Promise.resolve({ docs: [] }),
});

export const getDocs = (queryOrCollection) => {
  if (queryOrCollection.get) {
    return queryOrCollection.get();
  }
  return Promise.resolve({ docs: [] });
};

export const getDoc = (docRef) => {
  if (docRef.get) {
    return docRef.get();
  }
  return Promise.resolve({ exists: false, data: () => null });
};

export const setDoc = (docRef, data) => Promise.resolve();

export const updateDoc = (docRef, data) => Promise.resolve();

export const deleteDoc = (docRef) => Promise.resolve();

export const Timestamp = {
  now: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }),
  fromDate: (date) => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 }),
  fromMillis: (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }),
  toDate: (timestamp) => new Date(timestamp.seconds * 1000),
};

export const FieldValue = {
  serverTimestamp: () => ({ _methodName: 'serverTimestamp' }),
  delete: () => ({ _methodName: 'delete' }),
  increment: (n) => ({ _methodName: 'increment', _value: n }),
  arrayUnion: (...elements) => ({ _methodName: 'arrayUnion', _elements: elements }),
  arrayRemove: (...elements) => ({ _methodName: 'arrayRemove', _elements: elements }),
};

export const FieldPath = {
  documentId: () => ({ _methodName: 'documentId' }),
};

// Default export
export default () => mockDb;
