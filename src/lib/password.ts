export const hashPassword = (pw: string) =>
  Bun.password.hash(pw, { algorithm: "argon2id" });

export const verifyPassword = (pw: string, hash: string) =>
  Bun.password.verify(pw, hash);

export const SEVEN_DAYS_SEC = 7 * 24 * 3600;
