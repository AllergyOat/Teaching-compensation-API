import prisma from "../config/prisma.js";

export const listUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
};

export const ListForms = async (req, res, next) => {
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

    const updatedForm = await prisma.form.update({
      where: { id: formId },
      data: { status, adminComment },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        formScheduleDetails: { select: { sectionId: true, schedules: true } },
        compensation: true,
      },
    });
    res.json({ message: "Form status updated", form: updatedForm });
  } catch (err) {
    next(err);
  }
};
