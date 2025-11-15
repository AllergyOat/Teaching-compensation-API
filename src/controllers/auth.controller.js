import prisma from "../config/prisma.js";
import bcrypt from "bcryptjs";
import { signAccessToken } from "../utils/jwt.js";
import { generateVerificationToken, generateOtp6 } from "../utils/tokens.js";
import { sendMail } from "../utils/mailer.js";

const APP_URL = process.env.APP_URL || "http://localhost:4000";

export const register = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists)
      return res.status(409).json({ message: "Email already in use" });

    const hashed = await bcrypt.hash(password, 10);

    // Prevent privilege escalation from public register:
    const roleToUse = role === "MAJOR_ADMIN" ? "USER" : role || "USER";

    const user = await prisma.user.create({
      data: { email, password: hashed, role: roleToUse },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    // Create email verification token (valid 24h)
    const token = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.emailVerificationToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    // Send email (link version + token version)
    const verifyLink = `${APP_URL}/api/auth/verify-email?token=${token}`;
    await sendMail({
      to: user.email,
      subject: "Verify your email",
      text: `Verify your email: ${verifyLink}`,
      html: `<p>Click to verify your email:</p><p><a href="${verifyLink}">${verifyLink}</a></p>`,
    });

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
    });

    return res.status(201).json({
      user,
      accessToken,
      message: "Registered. Verification email sent.",
    });
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const payload = { sub: user.id, role: user.role, email: user.email };
    const token = signAccessToken(payload);

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      accessToken: token,
    });
  } catch (err) {
    next(err);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;

    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });
    if (!record) return res.status(400).json({ message: "Invalid token" });

    if (record.usedAt)
      return res.status(400).json({ message: "Token already used" });
    if (record.expiresAt < new Date())
      return res.status(400).json({ message: "Token expired" });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { isVerified: true },
      });
      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    });

    return res.json({ message: "Email verified successfully" });
  } catch (err) {
    next(err);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    // For privacy, respond success even if user not found
    if (!user)
      return res.json({
        message: "If that email exists, an OTP has been sent",
      });

    // Rate limiting: Check how many OTPs sent in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOtps = await prisma.passwordResetOtp.count({
      where: {
        userId: user.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentOtps >= 3) {
      return res.status(429).json({
        message: "Too many requests. Please try again later.",
      });
    }

    const otp = generateOtp6();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.passwordResetOtp.create({
      data: { userId: user.id, otpHash, expiresAt },
    });

    await sendMail({
      to: user.email,
      subject: "Your password reset OTP",
      html: `
        <h1>Password Reset OTP</h1>
        <p>Your OTP is: <b>${otp}</b></p>
        <p>This OTP will expire in 10 minutes.</p>
        `,
    });
    return res.json({ message: "If that email exists, an OTP has been sent" });
  } catch (err) {
    next(err);
  }
};

export const verifyResetOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: "อีเมลหรือรหัสไม่ถูกต้อง" });
    }

    // Get the most recent unused OTP
    const record = await prisma.passwordResetOtp.findFirst({
      where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "desc" },
    });

    if (!record) {
      return res.status(400).json({ message: "รหัสไม่ถูกต้องหรือหมดอายุ" });
    }

    const ok = await bcrypt.compare(String(otp), record.otpHash);

    if (!ok) {
      return res.status(400).json({ message: "รหัสไม่ถูกต้อง" });
    }

    return res.json({
      message: "OTP verified successfully",
      valid: true,
    });
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: "Invalid request" });
    }

    // Verify OTP again
    const record = await prisma.passwordResetOtp.findFirst({
      where: {
        userId: user.id,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: "desc" },
    });

    if (!record) {
      return res.status(400).json({ message: "รหัสไม่ถูกต้องหรือหมดอายุ" });
    }

    const ok = await bcrypt.compare(otp, record.otpHash);
    if (!ok) {
      return res.status(400).json({ message: "รหัสไม่ถูกต้องหรือหมดอายุ" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password AND mark OTP as used in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetOtp.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);

    return res.json({ message: "Password reset successfully" });
  } catch (err) {
    next(err);
  }
};

export const me = async (req, res) => {
  return res.json({ user: req.user });
};
