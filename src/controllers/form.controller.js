import prisma from "../config/prisma.js";
import { formSchema } from "../schemas/form.schemas.js";

export const createForm = async (req, res) => {
  try {
    const parsed = formSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Validation failed", errors: parsed.error.flatten() });
    }
    const body = parsed.data;

    console.log("req.user:", req.user);
    console.log("body.userId:", body.userId);

    // Prefer the authenticated user from token; allow admin to specify in body if provided
    const userId = body.userId ?? req?.user?.id;
    console.log("Final userId:", userId);

    if (!userId) {
      console.error(
        "No userId found. req.user:",
        req.user,
        "body.userId:",
        body.userId
      );
      return res.status(401).json({
        message: "Unauthenticated: userId not found",
        debug: {
          hasReqUser: !!req.user,
          reqUserKeys: req.user ? Object.keys(req.user) : [],
          hasBodyUserId: !!body.userId,
        },
      });
    }

    // create data
    const schedulesCreate = body.schedules.map((s) => ({
      date: new Date(s.date), // convert to Date
      time: s.time,
      totalHour: s.totalHour,
      topic: s.topic,
      room: s.room,
      note: s.note ?? null,
    }));

    const compensationCreate =
      body.isCompensated && body.compensation && body.compensation.length > 0
        ? {
            create: body.compensation.map((comp) => ({
              previousDate: new Date(comp.previousDate),
              previousTime: comp.previousTime,
              newDate: new Date(comp.newDate),
              newTime: comp.newTime,
              reason: comp.reason,
            })),
          }
        : undefined; // If not compensated, omit

    // 4) Create with Prisma (include children back)
    const created = await prisma.form.create({
      data: {
        userId,
        isCompensated: body.isCompensated,
        program: body.program,
        month: body.month,
        semester: body.semester,
        year: body.year,
        subjectId: body.subjectId,
        subjectName: body.subjectName,
        lectureId: body.lectureId ?? null,
        labId: body.labId ?? null,

        schedule: {
          create: schedulesCreate, // relation name is "schedule" (per your schema)
        },
        compensation: compensationCreate, // optional
      },
      include: {
        schedule: true,
        compensation: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return res.status(201).json({ data: created });
  } catch (err) {
    console.error("createForm error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const editForm = async (req, res) => {
  try {
    const formId = req.params.id;

    // Validate form ID
    if (!formId) {
      return res.status(400).json({ message: "Form ID is required" });
    }

    // Validate request body
    const parsed = formSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Validation failed", errors: parsed.error.flatten() });
    }
    const body = parsed.data;

    // Find existing form
    const existingForm = await prisma.form.findUnique({
      where: { id: formId },
      include: {
        schedule: true,
        compensation: true,
        user: { select: { id: true, role: true } },
      },
    });

    if (!existingForm) {
      return res.status(404).json({ message: "Form not found" });
    }

    // Check permissions - only owner or admin can edit
    const currentUserId = req?.user?.id;
    const isAdmin =
      req?.user?.role === "MAJOR_ADMIN" || req?.user?.role === "SUPER_ADMIN";

    if (existingForm.userId !== currentUserId && !isAdmin) {
      return res.status(403).json({
        message: "Forbidden: You can only edit your own forms",
      });
    }

    // Use transaction for atomic updates
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Delete existing schedules
      await tx.schedule.deleteMany({
        where: { formId },
      });

      // 2. Handle compensation deletion if needed
      if (existingForm.compensation && existingForm.compensation.length > 0) {
        // Delete all existing compensations
        await tx.compensation.deleteMany({
          where: { formId },
        });
      }

      // 3. Prepare new schedule data
      const schedulesCreate = body.schedules.map((s) => ({
        date: new Date(s.date),
        time: s.time,
        totalHour: s.totalHour,
        topic: s.topic,
        room: s.room,
        note: s.note ?? null,
      }));

      // 4. Prepare compensation data if needed
      let compensationCreate = undefined;
      if (body.isCompensated && body.compensation) {
        compensationCreate = {
          create: body.compensation.map
            ? body.compensation.map((comp) => ({
                previousDate: new Date(comp.previousDate),
                previousTime: comp.previousTime,
                newDate: new Date(comp.newDate),
                newTime: comp.newTime,
                reason: comp.reason,
              }))
            : [
                {
                  previousDate: new Date(body.compensation.previousDate),
                  previousTime: body.compensation.previousTime,
                  newDate: new Date(body.compensation.newDate),
                  newTime: body.compensation.newTime,
                  reason: body.compensation.reason,
                },
              ],
        };
      }

      // 5. Update form with new data
      const updatedForm = await tx.form.update({
        where: { id: formId },
        data: {
          isCompensated: body.isCompensated,
          program: body.program,
          month: body.month,
          semester: body.semester,
          year: body.year,
          subjectId: body.subjectId,
          subjectName: body.subjectName,
          lectureId: body.lectureId ?? null,
          labId: body.labId ?? null,
          schedule: {
            create: schedulesCreate,
          },
          compensation: compensationCreate,
        },
        include: {
          schedule: {
            orderBy: { date: "asc" },
          },
          compensation: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      return updatedForm;
    });

    console.log("Form updated successfully:", updated.id);
    return res.status(200).json({
      message: "Form updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("editForm error:", error);

    // Handle specific Prisma errors
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Form not found" });
    }

    if (error.code === "P2002") {
      return res.status(409).json({ message: "Duplicate entry conflict" });
    }

    return res.status(500).json({
      message: "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const getFormById = async (req, res) => {
  try {
    const formId = req.params.id;

    if (!formId) {
      return res.status(400).json({ message: "Form ID is required" });
    }

    const form = await prisma.form.findUnique({
      where: { id: formId },
      include: {
        schedule: {
          orderBy: { date: "asc" },
        },
        compensation: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            position: true,
            department: true,
          },
        },
      },
    });

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    // Check permissions - only owner or admin can view
    const currentUserId = req?.user?.id;
    const isAdmin =
      req?.user?.role === "MAJOR_ADMIN" || req?.user?.role === "SUPER_ADMIN";

    if (form.userId !== currentUserId && !isAdmin) {
      return res.status(403).json({
        message: "Forbidden: You can only view your own forms",
      });
    }

    return res.status(200).json({
      message: "Form retrieved successfully",
      data: form,
    });
  } catch (error) {
    console.error("getFormById error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const deleteForm = async (req, res) => {
  try {
    const formId = req.params.id;

    if (!formId) {
      return res.status(400).json({ message: "Form ID is required" });
    }

    // Find existing form
    const existingForm = await prisma.form.findUnique({
      where: { id: formId },
      select: {
        id: true,
        userId: true,
        subjectName: true,
        user: { select: { role: true } },
      },
    });

    if (!existingForm) {
      return res.status(404).json({ message: "Form not found" });
    }

    // Check permissions - only owner or admin can delete
    const currentUserId = req?.user?.id;
    const isAdmin =
      req?.user?.role === "MAJOR_ADMIN" || req?.user?.role === "SUPER_ADMIN";

    if (existingForm.userId !== currentUserId && !isAdmin) {
      return res.status(403).json({
        message: "Forbidden: You can only delete your own forms",
      });
    }

    // Delete form (cascade will handle related records)
    await prisma.form.delete({
      where: { id: formId },
    });

    console.log("Form deleted successfully:", formId);
    return res.status(200).json({
      message: "Form deleted successfully",
      deletedFormId: formId,
    });
  } catch (error) {
    console.error("deleteForm error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({ message: "Form not found" });
    }

    return res.status(500).json({
      message: "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
