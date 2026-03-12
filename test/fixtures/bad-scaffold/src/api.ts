export const API_BASE = 'http://localhost:3000';

export async function fetchThing() {
  const res = await fetch(API_BASE + '/thing');
  return res.json();
}
