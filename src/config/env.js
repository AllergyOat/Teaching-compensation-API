import "dotenv/config";

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_URL: process.env.DATABASE_URL,
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
  CORS_CREDENTIALS: process.env.CORS_CREDENTIALS ?? true,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "1h",

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
};

if (!env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}
if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
