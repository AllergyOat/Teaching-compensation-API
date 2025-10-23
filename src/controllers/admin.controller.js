import { fi } from "zod/v4/locales";
import prisma from "../config/prisma.js";
import { calculateAmount } from "../utils/calculater.js";

export const listUsers = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const search = req.query.search || "";

    // Build where clause
    const whereClause = {
      id: {
        not: currentUserId,
      },
    };

    // Add search filter if provided
    if (search) {
      whereClause.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ];
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      where: whereClause,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        degree: true,
        position: true,
        department: true,
        faculty: true,
        major: true,
        createdAt: true,
      },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
};

export const listForms = async (req, res, next) => {
  try {
    const forms = await prisma.form.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            major: true,
            department: true,
            faculty: true,
          },
        },
        formScheduleDetails: {
          select: {
            sectionId: true,
            schedules: true,
            compensation: true,
          },
        },
      },
    });
    res.json({ forms });
  } catch (err) {
    next(err);
  }
};

export const listHome = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const search = req.query.search || "";
    const { month, year, program, status } = req.query;

    // Build form filters
    const formWhere = {};

    if (month) {
      formWhere.month = month;
    }

    if (year) {
      formWhere.year = parseInt(year);
    }

    if (status) {
      formWhere.status = status;
    }

    if (program) {
      formWhere.program = program;
    }

    // Build search filter for user names
    const userWhere = {};
    if (search) {
      userWhere.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { major: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get users with their forms
    const usersWithForms = await prisma.user.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      where: {
        ...userWhere,
        forms: {
          some: formWhere, // Only include users who have at least one form matching the filters
        },
      },
      include: {
        forms: {
          where: formWhere, // Apply the same filters to the forms
          orderBy: { createdAt: "desc" },
          include: {
            formScheduleDetails: {
              select: {
                sectionId: true,
                // schedules: true,
              },
            },
          },
        },
      },
    });

    // Transform the data to group forms by user
    const formsGroupedByUser = usersWithForms.map((user) => ({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      userInfo: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        major: user.major,
      },
      forms: user.forms,
    }));

    // Calculate statistics
    let totalForms = 0;
    let totalPending = 0;
    let totalApproved = 0;
    let totalRejected = 0;

    formsGroupedByUser.forEach((user) => {
      user.forms.forEach((form) => {
        totalForms++;
        switch (form.status) {
          case "PENDING":
            totalPending++;
            break;
          case "APPROVED":
            totalApproved++;
            break;
          case "REJECTED":
            totalRejected++;
            break;
        }
      });
    });

    const currentAdmin = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        role: true,
        major: true,
      },
    });

    res.json({
      myInformation: {
        firstName: currentAdmin?.firstName || null,
        lastName: currentAdmin?.lastName || null,
        role: currentAdmin?.role || null,
        major: currentAdmin?.major || null,
      },
      statistics: {
        totalForms,
        totalPending,
        totalApproved,
        totalRejected,
      },
      usersWithForms: formsGroupedByUser,
    });
  } catch (err) {
    next(err);
  }
};

export const updateFormStatus = async (req, res, next) => {
  try {
    const formId = req.params.id;
    const { status, adminComment } = req.body;

    await prisma.form.update({
      where: { id: formId },
      data: { status, adminComment },
    });
    res.json({ message: "Form status updated" });
  } catch (err) {
    next(err);
  }
};

export const userDashboard = async (req, res, next) => {
  try {
    const year = req.params.year;
    const userId = req.params.id;
    const { program, month, section } = req.query;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Build where clause with filters
    const whereClause = {
      userId: userId,
      status: "APPROVED",
      year: parseInt(year),
    };

    // Add optional filters
    if (program) {
      whereClause.program = program;
    }
    if (month) {
      whereClause.month = month;
    }
    if (section) {
      whereClause.section = section;
    }

    const forms = await prisma.form.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        formScheduleDetails: {
          select: {
            sectionId: true,
            schedules: true,
            compensation: true,
          },
        },
      },
    });

    // Calculate amounts for each form
    const formsWithAmounts = forms.map((form) => {
      // Calculate total hours for this form
      const totalHours = form.formScheduleDetails.reduce((formSum, section) => {
        return (
          formSum +
          section.schedules.reduce((sectionSum, schedule) => {
            return sectionSum + (schedule.totalHour || 0);
          }, 0)
        );
      }, 0);

      // Calculate amount based on form.section
      const amount = calculateAmount(totalHours, form.section);

      return {
        ...form,
        totalHours,
        amount,
      };
    });

    // Calculate totals by section type
    const lectureForms = formsWithAmounts.filter(
      (form) => form.section === "LECTURE"
    );
    const labForms = formsWithAmounts.filter((form) => form.section === "LAB");

    const lectureAmount = lectureForms.reduce(
      (sum, form) => sum + (form.amount || 0),
      0
    );
    const lectureHours = lectureForms.reduce(
      (sum, form) => sum + (form.totalHours || 0),
      0
    );

    const labAmount = labForms.reduce(
      (sum, form) => sum + (form.amount || 0),
      0
    );
    const labHours = labForms.reduce(
      (sum, form) => sum + (form.totalHours || 0),
      0
    );

    const totalAmount = lectureAmount + labAmount;
    const totalHours = lectureHours + labHours;

    // Calculate monthly breakdown
    const monthlyData = {};
    const thaiMonths = [
      "มกราคม",
      "กุมภาพันธ์",
      "มีนาคม",
      "เมษายน",
      "พฤษภาคม",
      "มิถุนายน",
      "กรกฎาคม",
      "สิงหาคม",
      "กันยายน",
      "ตุลาคม",
      "พฤศจิกายน",
      "ธันวาคม",
    ];

    // Initialize all months with zero counts
    thaiMonths.forEach((month) => {
      monthlyData[month] = { Lecture: 0, Lab: 0 };
    });

    // Count forms by month and section
    formsWithAmounts.forEach((form) => {
      const month = form.month;
      if (monthlyData[month]) {
        if (form.section === "LECTURE") {
          monthlyData[month].Lecture += 1;
        } else if (form.section === "LAB") {
          monthlyData[month].Lab += 1;
        }
      }
    });

    // Convert to array format
    const monthlyBreakdown = thaiMonths.map((month) => ({
      month: month,
      Lecture: monthlyData[month].Lecture,
      Lab: monthlyData[month].Lab,
    }));

    // Calculate monthly amount breakdown (only months with data)
    const monthlyAmountData = {};

    formsWithAmounts.forEach((form) => {
      const month = form.month;
      if (!monthlyAmountData[month]) {
        monthlyAmountData[month] = 0;
      }
      monthlyAmountData[month] += form.amount || 0;
    });

    // Convert to array format (only months with data)
    const monthlyAmountBreakdown = Object.keys(monthlyAmountData).map(
      (month) => ({
        month: month,
        totalAmount: monthlyAmountData[month],
      })
    );

    // Calculate semester hours breakdown
    const semesterData = {};
    const semesters = ["ภาคต้น", "ภาคปลาย", "ภาคฤดูร้อน"];

    // Initialize semester data
    semesters.forEach((semester) => {
      semesterData[semester] = {
        totalLectureHours: 0,
        totalLabHours: 0,
      };
    });

    // Calculate hours by semester and section
    formsWithAmounts.forEach((form) => {
      const semester = form.semester;
      const totalHours = form.totalHours || 0;

      if (semesterData[semester]) {
        if (form.section === "LECTURE") {
          semesterData[semester].totalLectureHours += totalHours;
        } else if (form.section === "LAB") {
          semesterData[semester].totalLabHours += totalHours;
        }
      }
    });

    // Convert to array format with max hours
    const semesterHoursBreakdown = semesters.map((semester) => ({
      semester: semester,
      totalLectureHours: semesterData[semester].totalLectureHours,
      maxLectureHours: 45,
      totalLabHours: semesterData[semester].totalLabHours,
      maxLabHours: 30,
    }));

    // Calculate forms count by semester
    const semesterFormsCount = {};

    // Initialize semester forms count
    semesters.forEach((semester) => {
      semesterFormsCount[semester] = 0;
    });

    // Count forms by semester
    formsWithAmounts.forEach((form) => {
      const semester = form.semester;
      if (semesterFormsCount.hasOwnProperty(semester)) {
        semesterFormsCount[semester] += 1;
      }
    });

    // Convert to array format
    const semesterFormsBreakdown = semesters.map((semester) => ({
      semester: semester,
      formsCount: semesterFormsCount[semester],
    }));

    res.json({
      forms: formsWithAmounts,
      summary: {
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          department: user.department,
          major: user.major,
        },
        lecture: {
          totalHours: lectureHours,
          totalAmount: lectureAmount,
          formsCount: lectureForms.length,
        },
        lab: {
          totalHours: labHours,
          totalAmount: labAmount,
          formsCount: labForms.length,
        },
        grand: {
          totalHours: totalHours,
          totalAmount: totalAmount,
          formsCount: formsWithAmounts.length,
        },
      },
      graph1: monthlyBreakdown,
      graph2: monthlyAmountBreakdown,
      graph3: semesterHoursBreakdown,
      graph4: semesterFormsBreakdown,
    });
  } catch (error) {
    next(error);
  }
};
