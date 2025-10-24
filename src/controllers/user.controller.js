import prisma from "../config/prisma.js";
import { calculateAmount } from "../utils/calculater.js";

export const listMyForms = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { month, year, semester } = req.query;

    const where = { userId };

    // Filter by month if provided
    if (month) {
      where.month = month;
    }

    // Filter by year if provided
    if (year) {
      where.year = parseInt(year);
    }

    // Filter by semester if provided
    if (semester) {
      where.semester = semester;
    }

    const forms = await prisma.form.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subjectId: true,
        subjectName: true,
        program: true,
        section: true,
        month: true,
        semester: true,
        year: true,
        status: true,
        createdAt: true,
        formScheduleDetails: {
          select: { sectionId: true, schedules: true, compensation: true },
        },
      },
    });

    // helper to sum all schedule hours
    const sumSchedules = (schedules) =>
      (schedules ?? []).reduce((sum, sch) => sum + (sch.totalHour || 0), 0);

    // initialize accumulators
    let totalHour = 0;
    let totalLectureHours = 0;
    let totalLabHours = 0;
    let lectureAmount = 0;
    let labAmount = 0;

    for (const form of forms) {
      // sum hours for this form
      const formTotal = form.formScheduleDetails.reduce(
        (sum, section) => sum + sumSchedules(section.schedules),
        0
      );

      totalHour += formTotal;

      // separate totals by form.section
      if (form.section === "LECTURE") totalLectureHours += formTotal;
      if (form.section === "LAB") totalLabHours += formTotal;

      // Calculate amount only for APPROVED forms
      if (form.status === "APPROVED") {
        const amount = calculateAmount(formTotal, form.section);
        if (form.section === "LECTURE") {
          lectureAmount += amount;
        } else if (form.section === "LAB") {
          labAmount += amount;
        }
      }
    }

    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        degree: true,
        position: true,
        department: true,
        faculty: true,
        major: true,
        type: true,
        teachingLevel: true,
        createdAt: true,
      },
    });

    res.json({
      total_forms: forms.length,
      totalHour,
      totalLectureHours,
      totalLabHours,
      totalAmount: {
        labAmount,
        lectureAmount,
      },
      user,
      forms,
    });
  } catch (err) {
    next(err);
  }
};

export const listMyFormsStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { program, month, year } = req.query;

    const where = { userId };

    // Filter by program if provided
    if (program) {
      where.program = program;
    }

    // Filter by month if provided
    if (month) {
      where.month = month;
    }

    // Filter by year if provided
    if (year) {
      where.year = parseInt(year);
    }

    // Get forms with specific fields
    const forms = await prisma.form.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subjectId: true,
        subjectName: true,
        createdAt: true,
        status: true,
        adminComment: true,
      },
    });

    // Initialize status counts
    const statusCounts = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
    };

    // Count forms by status
    forms.forEach((form) => {
      statusCounts[form.status]++;
    });

    res.json({
      statusCounts,
      forms,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        degree: true,
        position: true,
        department: true,
        faculty: true,
        major: true,
        type: true,
        teachingLevel: true,
        createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

export const updateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      firstName,
      lastName,
      degree,
      position,
      department,
      faculty,
      major,
      type,
      teachingLevel,
    } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        degree,
        position,
        department,
        faculty,
        major,
        type,
        teachingLevel,
      },
    });

    return res.json({ message: "User settings updated successfully", user });
  } catch (err) {
    next(err);
  }
};
