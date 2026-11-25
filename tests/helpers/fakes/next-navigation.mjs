export class RedirectSignal extends Error {
  constructor(url) {
    super(`REDIRECT ${url}`);
    this.url = url;
  }
}
export function redirect(url) {
  throw new RedirectSignal(url);
}
export function notFound() {
  throw new Error("NOT_FOUND");
}
