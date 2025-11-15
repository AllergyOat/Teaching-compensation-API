import { z } from "zod";

export const registerSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    // allow creating an admin seed if you want, but lock it down in controller
    role: z.enum(["USER", "MAJOR_ADMIN"]).optional(),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
};

export const userSchema = {
  body: z.object({
    firstName: z.string().min(2).max(50),
    lastName: z.string().min(2).max(50),
    degree: z.string().min(1).max(100),
    position: z.string().min(1).max(100),
    department: z.string().min(1).max(100),
    faculty: z.string().min(1).max(100),
    major: z.string().min(1).max(100),
    type: z.string().min(1).max(100),
    teachingLevel: z.string().min(1).max(100),
  }),
}

export const verifyEmailSchema = {
  body: z.object({
    token: z.string().min(10)
  })
};

export const forgotPasswordSchema = {
  body: z.object({
    email: z.string().email(),
    otp: z.string().length(6).optional()
  })
};

export const resetPasswordSchema = {
  body: z.object({
    email: z.string().email(),
    otp: z.string().length(6),
    newPassword: z.string().min(6)
  })
};
