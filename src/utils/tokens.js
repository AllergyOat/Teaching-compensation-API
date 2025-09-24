import crypto from "crypto";

export function generateVerificationToken() {
  // 48 random bytes → 96 hex chars (plenty of entropy)
  return crypto.randomBytes(48).toString("hex");
}

export function generateOtp6() {
  // 6-digit OTP, padded
  return String(Math.floor(100000 + Math.random() * 900000));
}
