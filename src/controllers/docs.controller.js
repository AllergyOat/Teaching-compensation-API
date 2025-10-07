import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import prisma from "../config/prisma.js";
import { fileURLToPath } from "url";
import { formatThaiDate, mapProgramToThai } from "../utils/formatToThai.js";
import { calculateAmount } from "../utils/calculateAmount.js";
import ThaiBahtText from "thai-baht-text";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//========= INPUT SECTION ==========
export const generateScheduleDocx = async (req, res) => {
  try {
    console.log("Generate Schedule DOCX request received");

    const { formId, sectionId } = req.params;

    if (!formId) {
      return res.status(400).json({
        error: "Form ID is required",
      });
    }

    console.log("Fetching form data for ID:", formId);

    // Fetch form data with schedules from database
    const form = await prisma.form.findUnique({
      where: {
        id: formId,
      },
      include: {
        formScheduleDetails: {
          include: {
            schedules: true,
          },
        },
      },
    });

    if (!form) {
      return res.status(404).json({
        error: "Form not found",
        formId,
      });
    }

    console.log("Form found:", form);

    // Path to input template file
    const templatePath = path.join(
      __dirname,
      "../templates/input/แบบรายงานการสอน.docx"
    );

    if (!fs.existsSync(templatePath)) {
      console.error("Template file not found at:", templatePath);
      return res.status(500).json({
        error: "Input template file not found",
        path: templatePath,
      });
    }

    // Read template file
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);

    // Create Docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Find the specific section or use the first one if sectionId not provided
    let targetSection = null;
    let targetSchedules = [];
    let targetSectionId = "";

    if (form.formScheduleDetails && Array.isArray(form.formScheduleDetails)) {
      if (sectionId) {
        // Find specific section by sectionId
        targetSection = form.formScheduleDetails.find(
          (section) => section.sectionId === sectionId
        );
        if (!targetSection) {
          return res.status(404).json({
            error: "Section not found",
            sectionId,
          });
        }
      } else {
        targetSection = form.formScheduleDetails[0];
      }

      if (targetSection) {
        targetSchedules = targetSection.schedules || [];
        targetSectionId = targetSection.sectionId;
      }
    }

    // Prepare template data from form and target section schedules
    const templateData = {
      // Form data
      month: form.month || "",
      program: mapProgramToThai(form.program),
      semester: form.semester || "",
      year: form.year || "",
      subjectName: form.subjectName || "",
      lectureId: targetSection?.kind === "LECTURE" ? targetSectionId : "",
      labId: targetSection?.kind === "LAB" ? targetSectionId : "",
      id: 1,

      date:
        targetSchedules.length > 0
          ? formatThaiDate(targetSchedules[0].date)
          : "",
      time: targetSchedules.length > 0 ? targetSchedules[0].time : "",
      topic: targetSchedules.length > 0 ? targetSchedules[0].topic : "",
      room: targetSchedules.length > 0 ? targetSchedules[0].room : "",
      note: targetSchedules.length > 0 ? targetSchedules[0].note : "",

      // Additional formatting
      generatedDate: new Date().toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      generatedDateTime: new Date().toLocaleString("th-TH"),

      // Multiple schedules from target section (for templates that support arrays)
      schedules: targetSchedules.map((schedule, index) => ({
        index: index + 1,
        date: formatThaiDate(schedule.date) || "",
        time: schedule.time || "",
        topic: schedule.topic || "",
        room: schedule.room || "",
        note: schedule.note || "",
      })),
      scheduleCount: targetSchedules.length,

      // Section information
      sectionId: targetSectionId,
      sectionKind: targetSection?.kind || "",
    };

    console.log("Template data prepared:", templateData);

    try {
      // Render document with data (new API)
      doc.render(templateData);
      console.log("Document rendered successfully");
    } catch (renderError) {
      console.error("Render error:", renderError);
      return res.status(400).json({
        error: "Error rendering template",
        details: renderError.message,
        properties: renderError.properties || {},
      });
    }

    // Generate output buffer
    const buffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    // Generate filename with proper encoding
    const timestamp = Date.now();
    const subjectSlug = form.subjectName
      ? form.subjectName.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")
      : "subject";
    const monthSlug = form.month
      ? form.month.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")
      : "month";
    const filename = `teaching_report_${form.id}_${subjectSlug}_${monthSlug}_${timestamp}.docx`;

    console.log("Generated file:", filename, "Size:", buffer.length, "bytes");

    // Set response headers for file download with proper encoding
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    // Use encodeURIComponent to handle special characters
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader("Content-Length", buffer.length);

    // Send file
    res.send(buffer);
  } catch (error) {
    console.error("Generate Form DOCX error:", error);

    // Handle specific errors
    if (error.message.includes("ENOENT")) {
      return res.status(500).json({
        error: "Template file not found",
        details: "The input template file is missing from the templates folder",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Failed to generate document",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export const generateCompensationDocx = async (req, res) => {
  try {
    console.log("Generate Compensation DOCX request received");

    const { compensationId } = req.params;

    if (!compensationId) {
      return res.status(400).json({
        error: "Compensation ID is required",
      });
    }

    console.log("Fetching compensation data for ID:", compensationId);

    const compensation = await prisma.compensation.findUnique({
      where: {
        id: compensationId,
      },
      include: {
        formSection: {
          include: {
            form: {
              include: {
                user: true,
              },
            },
          },
        },
        originalSchedule: true, // Include the original schedule if referenced
      },
    });

    if (!compensation) {
      return res.status(404).json({
        error: "Compensation not found",
        compensationId,
      });
    }

    console.log("Compensation found:", JSON.stringify(compensation, null, 2));

    // Path to compensation template file
    const templatePath = path.join(
      __dirname,
      "../templates/input/บันทึกข้อความ.docx"
    );

    if (!fs.existsSync(templatePath)) {
      console.error("Template file not found at:", templatePath);
      return res.status(500).json({
        error: "Compensation template file not found",
        path: templatePath,
      });
    }

    // Read template file
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);

    // Create Docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Extract data from all related models
    const formSection = compensation.formSection;
    const form = formSection?.form;
    const user = form?.user;
    const originalSchedule = compensation.originalSchedule;

    if (!formSection || !form || !user) {
      return res.status(500).json({
        error: "Incomplete data structure",
        details: "Missing required relationships in compensation data",
        debug: {
          hasFormSection: !!formSection,
          hasForm: !!form,
          hasUser: !!user,
          hasOriginalSchedule: !!originalSchedule,
        },
      });
    }

    const templateData = {
      // Program data (mapped to Thai)
      program: mapProgramToThai(form.program),

      // Date (use current date for generation date)
      date: formatThaiDate(new Date()),

      // User data
      firstname: user.firstName || "",
      lastname: user.lastName || "",
      position: user.position || "",
      department: user.department || "",
      major: user.major || "",
      faculty: user.faculty || "",

      // Form data
      subjectName: form.subjectName || "",
      semester: form.semester || "",
      year: form.year || "",
      month: form.month || "",

      // FormSection data
      sectionId: formSection.sectionId || "",
      lectureId: formSection.kind === "LECTURE" ? formSection.sectionId : "",
      labId: formSection.kind === "LAB" ? formSection.sectionId : "",
      sectionKind: formSection.kind || "",

      // Original Schedule data (if available)
      scheduleDate: originalSchedule
        ? formatThaiDate(originalSchedule.date)
        : formatThaiDate(compensation.originalDate),
      scheduleTime: originalSchedule?.time || compensation.originalTime || "",
      scheduleTopic: originalSchedule?.topic || "",
      scheduleRoom: originalSchedule?.room || "",
      scheduleNote: originalSchedule?.note || "",
      scheduleTotalHour: originalSchedule?.totalHour || 0,

      // Compensation data (new/changed)
      newDate: formatThaiDate(compensation.newDate),
      newTime: compensation.newTime || "",
      reason: compensation.reason || "",

      // Compensation data as array for template loop
      compensation: [
        {
          previousDate: originalSchedule
            ? formatThaiDate(originalSchedule.date)
            : formatThaiDate(compensation.originalDate),
          previousTime:
            originalSchedule?.time || compensation.originalTime || "",
          newDate: formatThaiDate(compensation.newDate),
          newTime: compensation.newTime || "",
          reason: compensation.reason || "",
        },
      ],

      // Individual compensation fields (for backward compatibility)
      previousDate: originalSchedule
        ? formatThaiDate(originalSchedule.date)
        : formatThaiDate(compensation.originalDate),
      previousTime: originalSchedule?.time || compensation.originalTime || "",

      // Additional formatted fields
      generatedDate: formatThaiDate(new Date()),
      generatedDateTime: new Date().toLocaleString("th-TH"),
    };

    console.log("Template data prepared:", templateData);

    try {
      // Render document with data
      doc.render(templateData);
      console.log("Document rendered successfully");
    } catch (renderError) {
      console.error("Render error:", renderError);
      return res.status(400).json({
        error: "Error rendering template",
        details: renderError.message,
        properties: renderError.properties || {},
      });
    }

    // Generate output buffer
    const buffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    console.log("Buffer generated successfully, size:", buffer.length, "bytes");

    // Generate filename with proper encoding
    const timestamp = Date.now();
    const userSlug =
      user.firstName && user.lastName
        ? `${user.firstName}_${user.lastName}`
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "_")
        : "user";
    const subjectSlug = form.subjectName
      ? form.subjectName.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")
      : "subject";
    const filename = `memo_${compensation.id}_${userSlug}_${subjectSlug}_${timestamp}.docx`;

    console.log("Generated filename:", filename);

    // Set response headers for file download with proper encoding
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    // Use encodeURIComponent to handle special characters
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader("Content-Length", buffer.length);

    console.log("Headers set, sending file...");

    // Send file
    return res.send(buffer);
  } catch (error) {
    console.error("Generate Compensation DOCX error:", error);

    // Handle specific errors
    if (error.message.includes("ENOENT")) {
      return res.status(500).json({
        error: "Template file not found",
        details:
          "The compensation template file is missing from the templates folder",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Failed to generate compensation document",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

//========= OUTPUT SECTION ==========
export const generateDocx = (req, res) => {
  try {
    const formData = req.body;

    // Validate required fields (LATER: Make this)

    // Path to template file
    const templatePath = path.join(
      __dirname,
      "../templates/output/แบบใบเบิกเงินค่าสอน.docx"
    );

    if (!fs.existsSync(templatePath)) {
      console.error("Template file not found at:", templatePath);
      return res.status(500).json({
        error: "Template file not found",
        path: templatePath,
      });
    }

    // Read template file
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);

    // Create Docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Process template data with additional calculated fields
    const hour1 = parseFloat(formData.hour1) || 0;
    const hour2 = parseFloat(formData.hour2) || 0;
    const totalHours = hour1 + hour2;

    const templateData = {
      // Original fields
      major: formData.major || "",
      check1: formData.check1 || "☐",
      check2: formData.check2 || "☐",
      check3: formData.check3 || "☐",
      check4: formData.check4 || "☐",
      id: formData.id || "",
      name: formData.name || "",
      position: formData.position || "",
      week: formData.week || "",
      date: formData.date || "",
      subject: formData.subject || "",
      hour1: hour1.toString(),
      hour2: hour2.toString(),

      // Additional calculated/formatted fields
      totalHours: totalHours.toFixed(1),
      formattedWeek: `สัปดาห์ที่ ${formData.week || ""}`,
      formattedId: `รหัส: ${formData.id || ""}`,
      generatedDate: new Date().toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      generatedDateTime: new Date().toLocaleString("th-TH"),

      // Additional fields that might be in template
      subjectName: formData.subjectName || "",
      room: formData.room || "",
      note: formData.note || "",
      semester: formData.semester || "",
      year: formData.year || "",
      month: formData.month || "",
    };

    console.log("Template data prepared:", templateData);

    try {
      // Render document with data (new API)
      doc.render(templateData);
      console.log("Document rendered successfully");
    } catch (renderError) {
      console.error("Render error:", renderError);
      return res.status(400).json({
        error: "Error rendering template",
        details: renderError.message,
        properties: renderError.properties || {},
      });
    }

    // Generate output buffer
    const buffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    // Generate filename
    const timestamp = Date.now();
    const nameSlug = formData.name
      ? formData.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")
      : "document";
    const filename = `compensation_form_${
      formData.id || "user"
    }_${nameSlug}_${timestamp}.docx`;

    console.log("Generated file:", filename, "Size:", buffer.length, "bytes");

    // Set response headers for file download with proper encoding
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    // Use encodeURIComponent to handle special characters
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader("Content-Length", buffer.length);

    // Send file
    res.send(buffer);
  } catch (error) {
    console.error("Generate DOCX error:", error);

    // Handle specific errors
    if (error.message.includes("ENOENT")) {
      return res.status(500).json({
        error: "Template file not found",
        details:
          "The form.docx template file is missing from the templates folder",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Failed to generate document",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export const generateEvidenceDocx = async (req, res) => {
  try {
    console.log("Generate Evidence DOCX request received");

    const { formId, sectionId } = req.params;
    const formData = req.body;

    if (!formId) {
      return res.status(400).json({
        error: "Form ID is required",
      });
    }

    // Fetch form and user data from database
    const form = await prisma.form.findUnique({
      where: {
        id: formId,
      },
      include: {
        user: true,
        formScheduleDetails: {
          where: sectionId ? { sectionId } : undefined,
          include: {
            schedules: true,
          },
        },
      },
    });

    if (!form) {
      return res.status(404).json({
        error: "Form not found",
        formId: formData.formId,
      });
    }

    // Path to evidence template file
    const templatePath = path.join(
      __dirname,
      "../templates/output/หลักฐานการเบิกจ่ายเงินค่าสอนพิเศษและค่าสอนเกินภาระงานสอนในสถาบันอุดมศึกษา.docx"
    );

    if (!fs.existsSync(templatePath)) {
      console.error("Template file not found at:", templatePath);
      return res.status(500).json({
        error: "Evidence template file not found",
        path: templatePath,
      });
    }

    // Read template file
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);

    // Create Docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Prepare template data
    const name = `${form.user.firstName || ""} ${
      form.user.lastName || ""
    }`.trim();

    // Calculate total hours from all schedules in all formScheduleDetails
    const totalHours = Array.isArray(form.formScheduleDetails)
      ? form.formScheduleDetails.reduce((sum, section) => {
          if (section.schedules && Array.isArray(section.schedules)) {
            return (
              sum +
              section.schedules.reduce(
                (schedSum, schedule) =>
                  schedSum + (parseFloat(schedule.totalHour) || 0),
                0
              )
            );
          }
          return sum;
        }, 0)
      : 0;

    const amount = calculateAmount(totalHours, form.section) || "";
    const templateData = {
      major: form.user.major || "",
      program: mapProgramToThai(form.program) || "",
      faculty: form.user.department || "",
      semester: form.semester || "",
      year: form.year || "",
      month: form.month || "",

      id: 1,
      name: name || "",
      position: form.user.position || "",
      b1: formData.b1 || "",
      b2: formData.b2 || "",
      b3: formData.b3 || "",
      hours: totalHours.toString(),
      amount: amount,
      thaiAmount: ThaiBahtText(amount) || "",
    };

    console.log("Template data prepared:", templateData);

    try {
      // Render document with data
      doc.render(templateData);
      console.log("Document rendered successfully");
    } catch (renderError) {
      console.error("Render error:", renderError);
      return res.status(400).json({
        error: "Error rendering template",
        details: renderError.message,
        properties: renderError.properties || {},
      });
    }

    // Generate output buffer
    const buffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    // Generate filename
    const timestamp = Date.now();
    const nameSlug = name
      ? name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")
      : "evidence";
    const filename = `evidence_${
      formData.id || "user"
    }_${nameSlug}_${timestamp}.docx`;

    console.log("Generated file:", filename, "Size:", buffer.length, "bytes");

    // Set response headers for file download with proper encoding
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    // Use encodeURIComponent to handle special characters
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader("Content-Length", buffer.length);

    // Send file
    res.send(buffer);
  } catch (error) {
    console.error("Generate Evidence DOCX error:", error);

    // Handle specific errors
    if (error.message.includes("ENOENT")) {
      return res.status(500).json({
        error: "Template file not found",
        details:
          "The evidence template file is missing from the templates folder",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Failed to generate evidence document",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};
