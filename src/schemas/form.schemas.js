import { z } from "zod";

export const formSchema = z.object({
  // if you want to allow passing userId explicitly (e.g., admin creating for someone else), keep it optional
  // userId: z.string().cuid().optional(),

  // enum-like validations using literal union that match your Prisma enums
  program: z
    .enum(["REGULAR_PROGRAM", "SPECIAL_PROGRAM"])
    .default("REGULAR_PROGRAM"),

  isCompensated: z.boolean().default(false),

  month: z.string().min(1),
  semester: z.string().min(1),
  year: z.number().int(),
  subjectId: z.string().min(1),
  subjectName: z.string().min(1),
  lectureId: z.string().optional().nullable(),
  labId: z.string().optional().nullable(),

  // One-to-many schedules
  schedules: z
    .array(
      z.object({
        date: z.string().min(1), // ISO date string expected; will convert to Date
        time: z.string().min(1), // e.g., "09:00-11:00"
        totalHour: z.number().int().positive(),
        topic: z.string().min(1),
        room: z.string().min(1),
        note: z.string().optional().nullable(),
      })
    )
    .min(1, "At least one schedule is required"),

  compensation: z
    .array(
      z.object({
        previousDate: z.string().min(1),
        previousTime: z.string().min(1),
        newDate: z.string().min(1),
        newTime: z.string().min(1),
        reason: z.string().min(1),
      })
    )
    .optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"], {
    required_error: "Status is required",
    invalid_type_error: "Status must be either APPROVED or REJECTED",
  }),
  adminComment: z
    .string()
    .min(3, "Admin comment must be at least 3 characters")
    .max(500, "Admin comment must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
});
