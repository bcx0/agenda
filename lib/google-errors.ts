// Custom error types for Google Calendar OAuth/API failures.
// Lets callers (crons, routes, UI) distinguish "recoverable sync error"
// from "user must manually reconnect Google account".

export class GoogleReauthRequiredError extends Error {
  public readonly reason: string

  constructor(message: string, reason: string = 'invalid_credentials') {
    super(message)
    this.name = 'GoogleReauthRequiredError'
    this.reason = reason
  }
}

export function isReauthError(err: unknown): err is GoogleReauthRequiredError {
  return err instanceof Error && err.name === 'GoogleReauthRequiredError'
}
