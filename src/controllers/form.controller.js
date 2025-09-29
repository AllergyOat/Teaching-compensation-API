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

    // create data - handle new nested structure for FormSections and Schedules
    const formSectionsCreate = [];

    // Process formScheduleDetails to create FormSections with nested Schedules
    if (body.formScheduleDetails && Array.isArray(body.formScheduleDetails)) {
      body.formScheduleDetails.forEach((detail) => {
        if (detail.schedules && Array.isArray(detail.schedules)) {
          const schedulesForSection = detail.schedules.map((s) => ({
            date: new Date(s.date), // convert to Date
            time: s.time,
            totalHour: s.totalHour,
            topic: s.topic,
            room: s.room,
            note: s.note ?? null,
          }));

          formSectionsCreate.push({
            sectionId: detail.lectureId,
            kind: body.form.section === "LECTURE" ? "LECTURE" : "LAB",
            schedules: {
              create: schedulesForSection,
            },
          });
        }
      });
    }

    const compensationCreate =
      body.form.isCompensated &&
      body.compensation &&
      body.compensation.length > 0
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
        isCompensated: body.form.isCompensated,
        program: body.form.program,
        month: body.form.month,
        semester: body.form.semester,
        year: body.form.year,
        subjectId: body.form.subjectId,
        subjectName: body.form.subjectName,

        formScheduleDetails: {
          create: formSectionsCreate, // Create FormSections with nested Schedules
        },
        compensation: compensationCreate, // optional
      },
      include: {
        formScheduleDetails: {
          include: {
            schedules: true,
          },
        },
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
        formScheduleDetails: {
          include: {
            schedules: true,
          },
        },
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
      const formSectionsCreate = [];
      if (body.formScheduleDetails && Array.isArray(body.formScheduleDetails)) {
        body.formScheduleDetails.forEach((detail) => {
          if (detail.schedules && Array.isArray(detail.schedules)) {
            const schedulesForSection = detail.schedules.map((s) => ({
              date: new Date(s.date),
              time: s.time,
              totalHour: s.totalHour,
              topic: s.topic,
              room: s.room,
              note: s.note ?? null,
            }));

            formSectionsCreate.push({
              sectionId: detail.lectureId,
              kind: body.form.section === "LECTURE" ? "LECTURE" : "LAB",
              schedules: {
                create: schedulesForSection,
              },
            });
          }
        });
      }

      // Prepare compensation data if needed
      let compensationCreate = undefined;
      if (
        body.form.isCompensated &&
        body.compensation &&
        body.compensation.length > 0
      ) {
        compensationCreate = {
          create: body.compensation.map((comp) => ({
            previousDate: new Date(comp.previousDate),
            previousTime: comp.previousTime,
            newDate: new Date(comp.newDate),
            newTime: comp.newTime,
            reason: comp.reason,
          })),
        };
      }

      // Update form with new data
      const updatedForm = await tx.form.update({
        where: { id: formId },
        data: {
          isCompensated: body.form.isCompensated,
          program: body.form.program,
          month: body.form.month,
          semester: body.form.semester,
          year: body.form.year,
          subjectId: body.form.subjectId,
          subjectName: body.form.subjectName,
          formScheduleDetails: {
            create: formSectionsCreate,
          },
          compensation: compensationCreate,
        },
        include: {
          formScheduleDetails: {
            include: {
              schedules: {
                orderBy: { date: "asc" },
              },
            },
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
        formScheduleDetails: {
          include: {
            schedules: {
              orderBy: { date: "asc" },
            },
          },
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
