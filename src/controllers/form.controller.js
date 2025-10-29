import prisma from "../config/prisma.js";
import { formSchema } from "../schemas/form.schemas.js";
import { calculateTotalHours, calculateAmount } from "../utils/calculater.js";

export const createForm = async (req, res) => {
  try {
    const parsed = formSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Validation failed", errors: parsed.error.flatten() });
    }
    const body = parsed.data;

    // Prefer the authenticated user from token; allow admin to specify in body if provided
    const userId = body.userId ?? req?.user?.id;

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

    // Check if there's any compensation data
    let hasCompensation = false;
    if (body.formScheduleDetails && Array.isArray(body.formScheduleDetails)) {
      hasCompensation = body.formScheduleDetails.some(
        (detail) =>
          detail.compensation &&
          Array.isArray(detail.compensation) &&
          detail.compensation.length > 0
      );
    }

    // Process formScheduleDetails to create FormSections with nested Schedules
    if (body.formScheduleDetails && Array.isArray(body.formScheduleDetails)) {
      body.formScheduleDetails.forEach((detail) => {
        if (detail.schedules && Array.isArray(detail.schedules)) {
          const schedulesForSection = detail.schedules.map((s) => {
            const totalHour = calculateTotalHours(s.time);
            return {
              date: new Date(s.date), // convert to Date
              time: s.time,
              totalHour,
              topic: s.topic,
              room: s.room,
              note: s.note ?? null,
            };
          });

          formSectionsCreate.push({
            sectionId: detail.lectureId,
            kind: detail.kind || "LECTURE", // Use kind from request body with fallback
            totalHours: detail.totalHours || null, // Add totalHours for semester tracking
            schedules: {
              create: schedulesForSection,
            },
          });
        }
      });
    }

    // 4) Create with Prisma (include children back)
    const created = await prisma.form.create({
      data: {
        userId,
        isCompensated: hasCompensation,
        program: body.form.program,
        section: body.form.section,
        month: body.form.month,
        semester: body.form.semester,
        year: body.form.year,
        subjectId: body.form.subjectId,
        subjectName: body.form.subjectName,

        formScheduleDetails: {
          create: formSectionsCreate, // Create FormSections with nested Schedules
        },
      },
      include: {
        formScheduleDetails: {
          include: {
            schedules: true,
            compensation: true, // Include compensation through FormSections
          },
        },
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Optional: Create compensation if provided in formScheduleDetails
    if (body.formScheduleDetails && Array.isArray(body.formScheduleDetails)) {
      const compensationPromises = [];

      body.formScheduleDetails.forEach((detail) => {
        if (detail.compensation && Array.isArray(detail.compensation)) {
          // Find the corresponding created form section
          const createdSection = created.formScheduleDetails.find(
            (section) => section.sectionId === detail.lectureId
          );

          if (createdSection) {
            detail.compensation.forEach((comp) => {
              // Validate required compensation fields
              if (
                comp.originalDate &&
                comp.originalTime &&
                comp.newDate &&
                comp.newTime &&
                comp.reason
              ) {
                compensationPromises.push(
                  prisma.compensation
                    .create({
                      data: {
                        formSectionId: createdSection.id,
                        originalScheduleId: comp.originalScheduleId || null,
                        originalDate: new Date(comp.originalDate),
                        originalTime: comp.originalTime,
                        newDate: new Date(comp.newDate),
                        newTime: comp.newTime,
                        reason: comp.reason,
                      },
                      include: {
                        formSection: true,
                        originalSchedule: true,
                      },
                    })
                    .catch((error) => {
                      console.error(
                        `Error creating compensation for section ${detail.lectureId}:`,
                        error
                      );
                      return null;
                    })
                );
              }
            });
          }
        }
      });

      // Wait for all compensation records to be created
      if (compensationPromises.length > 0) {
        await Promise.all(compensationPromises);
      }
    }

    // Fetch the complete form with all compensation records
    const completeForm = await prisma.form.findUnique({
      where: { id: created.id },
      include: {
        formScheduleDetails: {
          include: {
            schedules: true,
            compensation: true,
          },
        },
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Update or Create SemesterTracking for each section
    for (const section of completeForm.formScheduleDetails) {
      // Calculate hours used in this month
      const hoursUsedThisMonth = section.schedules.reduce(
        (sum, schedule) => sum + (schedule.totalHour || 0),
        0
      );

      // Skip if no hours used this month
      if (hoursUsedThisMonth === 0) {
        continue;
      }

      // Check if tracking already exists
      const existingTracking = await prisma.semesterTracking.findUnique({
        where: {
          userId_semester_year_subjectId_sectionId: {
            userId: completeForm.userId,
            semester: completeForm.semester,
            year: completeForm.year,
            subjectId: completeForm.subjectId,
            sectionId: section.sectionId,
          },
        },
      });

      if (existingTracking) {
        // Update existing tracking (works even without totalHours)
        await prisma.semesterTracking.update({
          where: {
            userId_semester_year_subjectId_sectionId: {
              userId: completeForm.userId,
              semester: completeForm.semester,
              year: completeForm.year,
              subjectId: completeForm.subjectId,
              sectionId: section.sectionId,
            },
          },
          data: {
            hoursUsed: {
              increment: hoursUsedThisMonth,
            },
            hoursRemaining: {
              decrement: hoursUsedThisMonth,
            },
            updatedAt: new Date(),
          },
        });
      } else if (
        section.totalHours !== null &&
        section.totalHours !== undefined
      ) {
        // Create new tracking (requires totalHours)
        await prisma.semesterTracking.create({
          data: {
            userId: completeForm.userId,
            semester: completeForm.semester,
            year: completeForm.year,
            subjectId: completeForm.subjectId,
            subjectName: completeForm.subjectName,
            sectionId: section.sectionId,
            kind: section.kind || "LECTURE",
            totalHoursRequired: section.totalHours,
            hoursUsed: hoursUsedThisMonth,
            hoursRemaining: section.totalHours - hoursUsedThisMonth,
          },
        });
      } else {
        // Warning: Cannot create tracking without totalHours
        console.warn(
          `Cannot create SemesterTracking for ${completeForm.subjectId} section ${section.sectionId}: totalHours not provided`
        );
      }
    }

    return res.status(201).json({ data: completeForm });
  } catch (err) {
    console.error("createForm error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const createCompensation = async (req, res) => {
  try {
    const {
      formSectionId,
      originalScheduleId,
      originalDate,
      originalTime,
      newDate,
      newTime,
      reason,
    } = req.body;

    // Validate required fields
    if (
      !formSectionId ||
      !originalDate ||
      !originalTime ||
      !newDate ||
      !newTime ||
      !reason
    ) {
      return res.status(400).json({
        message: "Missing required fields",
        required: [
          "formSectionId",
          "originalDate",
          "originalTime",
          "newDate",
          "newTime",
          "reason",
        ],
      });
    }

    // Check if formSection exists and get related form for permission check
    const formSection = await prisma.formSections.findUnique({
      where: { id: formSectionId },
      include: {
        form: {
          include: {
            user: true,
          },
        },
        schedules: originalScheduleId
          ? {
              where: { id: originalScheduleId },
            }
          : false,
      },
    });

    if (!formSection) {
      return res.status(404).json({
        message: "Form section not found",
      });
    }

    // If originalScheduleId is provided, verify it exists in this form section
    if (originalScheduleId) {
      const schedule = await prisma.schedule.findFirst({
        where: {
          id: originalScheduleId,
          formSectionId: formSectionId,
        },
      });

      if (!schedule) {
        return res.status(404).json({
          message: "Original schedule not found in this form section",
        });
      }
    }

    // Check permissions - only owner or admin can create compensation
    const currentUserId = req?.user?.id;
    const isAdmin =
      req?.user?.role === "MAJOR_ADMIN" || req?.user?.role === "SUPER_ADMIN";

    if (formSection.form.userId !== currentUserId && !isAdmin) {
      return res.status(403).json({
        message:
          "Forbidden: You can only create compensation for your own forms",
      });
    }

    // Create compensation
    const compensation = await prisma.compensation.create({
      data: {
        formSectionId,
        originalScheduleId: originalScheduleId || null,
        originalDate: new Date(originalDate),
        originalTime,
        newDate: new Date(newDate),
        newTime,
        reason,
      },
      include: {
        formSection: {
          include: {
            form: {
              select: {
                id: true,
                subjectName: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        originalSchedule: true, // Include the original schedule if referenced
      },
    });

    return res.status(201).json({
      message: "Compensation created successfully",
      data: compensation,
    });
  } catch (error) {
    console.error("createCompensation error:", error);

    // Handle specific Prisma errors
    if (error.code === "P2002") {
      return res.status(409).json({
        message: "Compensation already exists for this schedule",
      });
    }

    if (error.code === "P2025") {
      return res.status(404).json({
        message: "Schedule not found",
      });
    }

    return res.status(500).json({
      message: "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
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
            compensation: true, // Include compensation through FormSections
          },
        },
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
      // First, delete existing formScheduleDetails to avoid conflicts
      await tx.formSections.deleteMany({
        where: { formId: formId },
      });

      // Check if there's any compensation data
      let hasCompensation = false;
      if (body.formScheduleDetails && Array.isArray(body.formScheduleDetails)) {
        hasCompensation = body.formScheduleDetails.some(
          (detail) =>
            detail.compensation &&
            Array.isArray(detail.compensation) &&
            detail.compensation.length > 0
        );
      }

      const formSectionsCreate = [];
      if (body.formScheduleDetails && Array.isArray(body.formScheduleDetails)) {
        body.formScheduleDetails.forEach((detail) => {
          if (detail.schedules && Array.isArray(detail.schedules)) {
            const schedulesForSection = detail.schedules.map((s) => {
              const totalHour = calculateTotalHours(s.time);
              return {
                date: new Date(s.date), // convert to Date
                time: s.time,
                totalHour,
                topic: s.topic,
                room: s.room,
                note: s.note ?? null,
              };
            });

            formSectionsCreate.push({
              sectionId: detail.lectureId,
              kind: detail.kind || "LECTURE", // Use kind from request body with fallback
              schedules: {
                create: schedulesForSection,
              },
            });
          }
        });
      }

      // Update form with new data
      const updatedForm = await tx.form.update({
        where: { id: formId },
        data: {
          isCompensated: hasCompensation,
          program: body.form.program,
          section: body.form.section, // Add missing section field
          month: body.form.month,
          semester: body.form.semester,
          year: body.form.year,
          subjectId: body.form.subjectId,
          subjectName: body.form.subjectName,
          status: "PENDING",
          adminComment: null,
          formScheduleDetails: {
            create: formSectionsCreate,
          },
        },
        include: {
          formScheduleDetails: {
            include: {
              schedules: {
                orderBy: { date: "asc" },
              },
              compensation: true, // Include compensation through FormSections
            },
          },
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      // Create compensation records if provided
      if (body.formScheduleDetails && Array.isArray(body.formScheduleDetails)) {
        const compensationPromises = [];

        body.formScheduleDetails.forEach((detail) => {
          if (detail.compensation && Array.isArray(detail.compensation)) {
            // Find the corresponding created form section
            const createdSection = updatedForm.formScheduleDetails.find(
              (section) => section.sectionId === detail.lectureId
            );

            if (createdSection) {
              detail.compensation.forEach((comp) => {
                // Validate required compensation fields
                if (
                  comp.originalDate &&
                  comp.originalTime &&
                  comp.newDate &&
                  comp.newTime &&
                  comp.reason
                ) {
                  compensationPromises.push(
                    tx.compensation
                      .create({
                        data: {
                          formSectionId: createdSection.id,
                          originalScheduleId: comp.originalScheduleId || null,
                          originalDate: new Date(comp.originalDate),
                          originalTime: comp.originalTime,
                          newDate: new Date(comp.newDate),
                          newTime: comp.newTime,
                          reason: comp.reason,
                        },
                        include: {
                          formSection: true,
                          originalSchedule: true,
                        },
                      })
                      .catch((error) => {
                        console.error(
                          `Error creating compensation for section ${detail.lectureId}:`,
                          error
                        );
                        return null;
                      })
                  );
                }
              });
            }
          }
        });

        // Wait for all compensation records to be created
        if (compensationPromises.length > 0) {
          await Promise.all(compensationPromises);
        }
      }

      return updatedForm;
    });

    // Fetch the complete form with all compensation records
    const completeForm = await prisma.form.findUnique({
      where: { id: updated.id },
      include: {
        formScheduleDetails: {
          include: {
            schedules: {
              orderBy: { date: "asc" },
            },
            compensation: true,
          },
        },
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return res.status(200).json({
      message: "Form updated successfully",
      data: completeForm,
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
    const sectionId = req.params.sectionId;

    if (!formId) {
      return res.status(400).json({ message: "Form ID is required" });
    }

    const form = await prisma.form.findUnique({
      where: { id: formId },
      include: {
        formScheduleDetails: {
          where: sectionId ? { sectionId } : undefined,
          include: {
            schedules: {
              orderBy: { date: "asc" },
            },
            compensation: true,
          },
        },
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

    if (isAdmin) {
      // Calculate amounts for each section and total for admin
      const calculatedData = {
        ...form,
        formScheduleDetails: form.formScheduleDetails.map((section) => {
          // Calculate total hours for this section
          const totalHours = section.schedules.reduce((sum, schedule) => {
            return sum + (schedule.totalHour || 0);
          }, 0);

          // Calculate amount based on form.section (not section.kind)
          const amount = calculateAmount(totalHours, form.section);

          return {
            ...section,
            totalHours,
            amount,
          };
        }),
      };

      // Calculate Total Hour Amount
      const totalHourAmount = calculatedData.formScheduleDetails.reduce(
        (sum, section) => {
          return sum + (section.totalHours || 0);
        },
        0
      );

      // Calculate grand total
      const grandTotal = calculatedData.formScheduleDetails.reduce(
        (sum, section) => {
          return sum + (section.amount || 0);
        },
        0
      );

      calculatedData.totalHourAmount = totalHourAmount;
      calculatedData.grandTotal = grandTotal;

      return res.status(200).json({
        message: "Form retrieved successfully",
        data: calculatedData,
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

export const getSemesterTracking = async (req, res) => {
  try {
    const { semester, year } = req.query;
    const userId = req.user.id;

    if (!semester || !year) {
      return res.status(400).json({
        message: "semester and year are required",
      });
    }

    // Get all tracking records for this user in this semester
    const trackings = await prisma.semesterTracking.findMany({
      where: {
        userId,
        semester,
        year: parseInt(year),
      },
      orderBy: [{ subjectId: "asc" }, { sectionId: "asc" }],
    });

    // Group by subject
    const groupedBySubject = trackings.reduce((acc, track) => {
      if (!acc[track.subjectId]) {
        acc[track.subjectId] = {
          subjectId: track.subjectId,
          subjectName: track.subjectName,
          sections: [],
        };
      }
      acc[track.subjectId].sections.push({
        sectionId: track.sectionId,
        kind: track.kind,
        totalHoursRequired: track.totalHoursRequired,
        hoursUsed: track.hoursUsed,
        hoursRemaining: track.hoursRemaining,
        createdAt: track.createdAt,
        updatedAt: track.updatedAt,
      });
      return acc;
    }, {});

    return res.status(200).json({
      data: Object.values(groupedBySubject),
    });
  } catch (error) {
    console.error("getSemesterTracking error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
