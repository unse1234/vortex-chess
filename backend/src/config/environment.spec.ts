import { validateEnvironment } from './environment';
const base = {
  DATABASE_URL: 'postgresql://test@localhost/vortix_test',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  CORS_ORIGINS: 'http://localhost:3000',
};
describe('Environment validation', () => {
  it('accepts explicit local origins and parses booleans/numbers', () => {
    expect(
      validateEnvironment({ ...base, COOKIE_SECURE: 'false', PORT: '3001' }),
    ).toMatchObject({ COOKIE_SECURE: false, PORT: 3001 });
  });
  it.each([
    { CORS_ORIGINS: '*' },
    { CORS_ORIGINS: 'http://localhost:3000/' },
    { CORS_ORIGINS: 'http://localhost:3000/path' },
    { JWT_ACCESS_SECRET: 'short' },
    { JWT_ACCESS_SECRET: 'GENERATE_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS' },
    { COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' },
    { NODE_ENV: 'production', COOKIE_SECURE: 'false' },
    { NODE_ENV: 'production', COOKIE_SECURE: 'true' },
    { DATABASE_URL: 'file:./test.db' },
    { TRUST_PROXY_HOPS: '-1' },
    { MAIL_TRANSPORT: 'smtp' },
    { MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.com' },
    {
      MAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      MAIL_FROM: 'Vortex Chess <noreply@example.com>',
      SMTP_USER: 'only-user',
    },
    { INVITATION_TTL_MINUTES: '0' },
    { APP_PUBLIC_URL: 'ftp://example.com' },
  ])('rejects unsafe/missing configuration %#', (override) => {
    expect(() => validateEnvironment({ ...base, ...override })).toThrow(
      'Invalid environment',
    );
  });
  it('supports secure HTTPS cross-site deployment explicitly', () => {
    expect(
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://chess.example.com',
        COOKIE_SECURE: 'true',
        COOKIE_SAME_SITE: 'none',
      }).COOKIE_SECURE,
    ).toBe(true);
  });
  it('parses centrally configured rating windows and preserves the defaults', () => {
    expect(validateEnvironment(base).MATCHMAKING_RATING_WINDOWS).toEqual([
      { untilSeconds: 15, difference: 100 }, { untilSeconds: 30, difference: 200 }, { untilSeconds: 60, difference: 400 },
    ]);
    expect(validateEnvironment({ ...base, MATCHMAKING_RATING_WINDOWS: '10:50,20:150' }).MATCHMAKING_RATING_WINDOWS)
      .toEqual([{ untilSeconds: 10, difference: 50 }, { untilSeconds: 20, difference: 150 }]);
  });
  it.each(['oops', '30:100,15:200', '15:400,30:100', '0:100', '301:100', '15:10001'])('rejects invalid rating window config %s', (value) => {
    expect(() => validateEnvironment({ ...base, MATCHMAKING_RATING_WINDOWS: value })).toThrow('Invalid environment');
  });
});
