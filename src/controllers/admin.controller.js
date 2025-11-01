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

export const createSubjectSectionRate = async (req, res, next) => {
  try {
    const UserId = req.user.id;
    const currentYear = new Date().getFullYear() + 543; // ปีปัจจุบัน (พ.ศ.)

    // Check if request body has 'sections' array or single object
    const sectionsArray = req.body.sections || [req.body];

    // Validate that we have at least one section
    if (!sectionsArray || sectionsArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "กรุณากรอกข้อมูลอย่างน้อย 1 section",
      });
    }

    // Validate all sections
    const errors = [];
    sectionsArray.forEach((sectionData, index) => {
      const {
        subjectId,
        subjectName,
        program,
        section,
        sectionId,
        kind,
        semester,
        ratePerHour,
        maxTotalHours,
      } = sectionData;

      if (
        !subjectId ||
        !subjectName ||
        !section ||
        !sectionId ||
        !kind ||
        !semester ||
        !ratePerHour ||
        !maxTotalHours ||
        !program
      ) {
        errors.push({
          index,
          message: "ข้อมูลไม่ครบถ้วนที่ index " + index,
          data: sectionData,
        });
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "กรุณากรอกข้อมูลให้ครบถ้วน",
        errors,
      });
    }

    // Process all sections in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const createdRates = [];
      const skippedRates = [];
      let trackingCreatedCount = 0;

      for (const sectionData of sectionsArray) {
        const {
          subjectId,
          subjectName,
          program,
          section,
          sectionId,
          kind,
          semester,
          ratePerHour,
          maxTotalHours,
          teacherTotalHours,
        } = sectionData;

        // ตรวจสอบว่ามี rate config นี้อยู่แล้วหรือไม่
        const existingRate = await tx.subjectSectionRate.findUnique({
          where: {
            subjectId_sectionId_semester_program_section: {
              subjectId,
              sectionId,
              semester,
              program,
              section,
            },
          },
        });

        if (existingRate) {
          skippedRates.push({
            subjectId,
            sectionId,
            program,
            section,
            reason: "มีข้อมูลอยู่แล้ว",
          });
          continue;
        }

        // สร้าง SubjectSectionRate
        const newRate = await tx.subjectSectionRate.create({
          data: {
            subjectId,
            subjectName,
            section,
            sectionId,
            program,
            kind,
            semester,
            ratePerHour: parseFloat(ratePerHour),
            MaxTotalHours: parseFloat(maxTotalHours),
            teacherTotalHours: teacherTotalHours
              ? parseFloat(teacherTotalHours)
              : null,
          },
        });

        createdRates.push(newRate);

        // สร้าง SemesterTracking สำหรับ user ที่สร้าง rate config
        const totalHoursToUse = teacherTotalHours
          ? parseFloat(teacherTotalHours)
          : parseFloat(maxTotalHours);

        // ตรวจสอบว่ามี tracking อยู่แล้วหรือไม่
        const existingTracking = await tx.semesterTracking.findUnique({
          where: {
            semester_year_subjectId_sectionId_program_section: {
              semester: semester,
              year: currentYear,
              subjectId: subjectId,
              sectionId: sectionId,
              program: program,
              section: section,
            },
          },
        });

        // ถ้ายังไม่มี ให้สร้างใหม่
        if (!existingTracking) {
          await tx.semesterTracking.create({
            data: {
              userId: UserId,
              semester: semester,
              program: program,
              section: section,
              year: currentYear,
              subjectId: subjectId,
              subjectName: subjectName,
              sectionId: sectionId,
              kind: kind,
              totalHoursRequired: totalHoursToUse,
              hoursUsed: 0,
              hoursRemaining: totalHoursToUse,
            },
          });
          trackingCreatedCount++;
        }
      }

      return {
        createdRates,
        skippedRates,
        trackingCreatedCount,
      };
    });

    return res.status(201).json({
      success: true,
      message: `สร้าง rate configuration สำเร็จ ${
        result.createdRates.length
      } รายการ${
        result.skippedRates.length > 0
          ? `, ข้าม ${result.skippedRates.length} รายการที่มีอยู่แล้ว`
          : ""
      }`,
      data: {
        created: result.createdRates,
        skipped: result.skippedRates,
        trackingCreated: result.trackingCreatedCount,
      },
    });
  } catch (error) {
    console.error("Error creating subject section rate:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการสร้างข้อมูล",
      error: error.message,
    });
  }
};

export const editSubjectSectionRate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      subjectId,
      sectionId,
      semester,
      program,
      kind,
      ratePerHour,
      maxTotalHours,
      teacherTotalHours,
    } = req.body;

    // Validate required fields
    if (
      !subjectId ||
      !sectionId ||
      !semester ||
      !ratePerHour ||
      !maxTotalHours ||
      !program
    ) {
      return res.status(400).json({
        success: false,
        message: "กรุณากรอกข้อมูลให้ครบถ้วน",
      });
    }

    // Update SubjectSectionRate
    const updatedRate = await prisma.subjectSectionRate.update({
      where: { id: id },
      data: {
        subjectId,
        sectionId,
        semester,
        program,
        kind,
        ratePerHour: parseFloat(ratePerHour),
        MaxTotalHours: parseFloat(maxTotalHours),
        teacherTotalHours: teacherTotalHours
          ? parseFloat(teacherTotalHours)
          : null,
      },
    });

    return res.status(200).json({
      success: true,
      message: "แก้ไขข้อมูล rate configuration สำเร็จ",
      data: updatedRate,
    });
  } catch (error) {
    console.error("Error editing subject section rate:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการแก้ไขข้อมูล",
      error: error.message,
    });
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
