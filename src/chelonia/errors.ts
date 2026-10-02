// Here rather than in auth.ts, so lists.ts can throw one without importing the
// module that imports it.
export type AuthErrorOptions = ErrorOptions & { exact?: boolean }

export class AuthError extends Error {
  // Login turns most failures into "incorrect username or password". This
  // marks the ones whose message is already the right one.
  readonly exact: boolean

  constructor (message: string, options?: AuthErrorOptions) {
    super(message, options)
    this.name = 'AuthError'
    this.exact = !!options?.exact
  }
}
