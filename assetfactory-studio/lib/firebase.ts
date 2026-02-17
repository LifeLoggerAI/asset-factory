// Placeholder for Firebase Admin SDK initialization
// import * as admin from 'firebase-admin';
//
// admin.initializeApp();
//
// export const db = admin.firestore();
console.log("Firebase Admin SDK not initialized. Please configure.");
export const db = {
  collection: (name: string) => ({
    where: (...args: any[]) => ({
      get: async () => ({ empty: true, docs: [] }),
    }),
    add: async (data: any) => ({ id: 'mockId' }),
  })
};
