export class NextRequest {
  constructor(url, init = {}) {
    this.url = url;
    this.headers = new Headers(init.headers ?? {});
  }
}
export const NextResponse = {
  json(body, init = {}) {
    return { body, status: init.status ?? 200 };
  }
};
