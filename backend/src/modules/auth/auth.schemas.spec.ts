import { loginSchema, registerSchema } from './auth.schemas';
const valid = {
  username: 'Chess_User',
  email: ' User@Example.com ',
  password: 'password123',
  confirmPassword: 'password123',
  acceptTerms: true,
};
describe('Authentication contracts', () => {
  it('normalizes identities without changing the password or username casing', () => {
    expect(registerSchema.parse(valid)).toEqual({
      ...valid,
      email: 'user@example.com',
    });
  });
  it.each([
    { confirmPassword: 'wrong' },
    { username: 'ab' },
    { email: 'username' },
    { password: 'short' },
    { password: 'a'.repeat(129) },
    { acceptTerms: false },
  ])('rejects invalid registration %#', (override) => {
    expect(registerSchema.safeParse({ ...valid, ...override }).success).toBe(
      false,
    );
  });
  it('rejects username/identifier login and unknown alternative provider fields', () => {
    expect(
      loginSchema.safeParse({
        identifier: 'user@example.com',
        password: 'password123',
      }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'username', password: 'password123' })
        .success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
        provider: 'google',
      }).success,
    ).toBe(false);
    expect(
      loginSchema.parse({
        email: ' User@Example.com ',
        password: 'password123',
      }).email,
    ).toBe('user@example.com');
  });
});
