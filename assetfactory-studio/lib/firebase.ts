export const db = {
  collection() { throw new Error('firebase client db unavailable in studio local mode'); }
};
export const auth = null;
export const storage = null;
