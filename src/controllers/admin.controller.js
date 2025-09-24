import prisma from "../config/prisma.js";
import { formSchema } from "../schemas/form.schemas.js";

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
        schedule: {
          orderBy: { date: "asc" },
        },
        compensation: true,
      },
    });
    res.json({ forms });
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
        schedule: true,
        compensation: true,
      },
    });
    res.json({ message: "Form status updated", form: updatedForm });
  } catch (err) {
    next(err);
  }
};
