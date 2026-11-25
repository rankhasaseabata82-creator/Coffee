// All backend calls go through here. The URL comes from an environment variable.
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}
export const money = (n) => `M${Number(n).toFixed(2)}`;
