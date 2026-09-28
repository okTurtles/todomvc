// Here rather than in auth.js, so lists.js can throw one without importing the
// module that imports it.
export class AuthError extends Error {
  constructor (message, options) {
    super(message, options)
    this.name = 'AuthError'
    // Login turns most failures into "incorrect username or password". This
    // marks the ones whose message is already the right one.
    this.exact = !!options?.exact
  }
}
