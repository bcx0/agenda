export function cookies() {
  return { get: () => undefined, set: () => {}, delete: () => {} };
}
export function headers() {
  return new Map();
}
