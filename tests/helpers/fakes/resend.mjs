export class Resend {
  constructor() {
    this.emails = { send: async () => ({ data: { id: "test" }, error: null }) };
  }
}
