import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import prisma from "../config/prisma.js";
import { fileURLToPath } from "url";
import { formatThaiDate, mapProgramToThai } from "../utils/formatToThai.js";
import { calculateAmount, calculateTotalHours } from "../utils/calculater.js";
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

    const { formId, sectionId } = req.params;

    if (!formId) {
      return res.status(400).json({
        error: "Form ID is required",
      });
    }

    console.log(
      "Fetching compensation data for formId:",
      formId,
      "sectionId:",
      sectionId
    );

    // Fetch form data with formScheduleDetails and compensations
    const form = await prisma.form.findUnique({
      where: {
        id: formId,
      },
      include: {
        user: true,
        formScheduleDetails: {
          where: sectionId ? { sectionId: sectionId } : undefined,
          include: {
            compensation: true,
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

    // Find the target section
    const targetSection = form.formScheduleDetails[0];

    if (!targetSection) {
      return res.status(404).json({
        error: "Section not found",
        sectionId,
      });
    }

    const compensations = targetSection.compensation || [];

    if (compensations.length === 0) {
      return res.status(404).json({
        error: "No compensation records found for this section",
        formId,
        sectionId,
      });
    }

    console.log("Compensations found:", compensations.length);

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

    const user = form.user;

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
      sectionId: targetSection.sectionId || "",
      lectureId:
        targetSection.kind === "LECTURE" ? targetSection.sectionId : "",
      labId: targetSection.kind === "LAB" ? targetSection.sectionId : "",
      sectionKind: targetSection.kind || "",

      // Compensation data as array for template loop
      compensation: compensations.map((comp) => ({
        previousDate: formatThaiDate(comp.originalDate),
        previousTime: comp.originalTime || "",
        newDate: formatThaiDate(comp.newDate),
        newTime: comp.newTime || "",
        reason: comp.reason || "",
      })),

      // First compensation fields (for backward compatibility)
      previousDate: formatThaiDate(compensations[0].originalDate),
      previousTime: compensations[0].originalTime || "",
      newDate: formatThaiDate(compensations[0].newDate),
      newTime: compensations[0].newTime || "",
      reason: compensations[0].reason || "",

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
    const filename = `memo_${formId}_${targetSection.sectionId}_${userSlug}_${subjectSlug}_${timestamp}.docx`;

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
export const generateDocx = async (req, res) => {
  try {
    console.log("Generate Payment Form DOCX request received");

    const { formId, sectionId } = req.params;

    if (!formId || !sectionId) {
      return res.status(400).json({
        error: "Form ID and Section ID are required",
      });
    }

    console.log(
      "Fetching form data for formId:",
      formId,
      "sectionId:",
      sectionId
    );

    // Fetch form data with schedules and compensations
    const form = await prisma.form.findUnique({
      where: {
        id: formId,
      },
      include: {
        user: true,
        formScheduleDetails: {
          where: { sectionId: sectionId },
          include: {
            schedules: {
              orderBy: {
                date: "asc",
              },
            },
            compensation: true,
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

    const targetSection = form.formScheduleDetails[0];

    if (!targetSection) {
      return res.status(404).json({
        error: "Section not found",
        sectionId,
      });
    }

    const schedules = targetSection.schedules || [];
    const compensations = targetSection.compensation || [];

    console.log("Schedules found:", schedules.length);
    console.log("Compensations found:", compensations.length);

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

    // Prepare template data
    const user = form.user;
    const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim();

    // Calculate total hours from schedules
    const totalHours = schedules.reduce((sum, schedule) => {
      return sum + (parseFloat(schedule.totalHour) || 0);
    }, 0);

    // Calculate compensation hours for each compensation (ch1-6)
    const compensationHours = compensations.map((comp) =>
      calculateTotalHours(comp.newTime)
    );

    // Calculate total compensation hours
    const totalCompensationHours = compensationHours.reduce(
      (sum, hours) => sum + hours,
      0
    );

    // Helper function to get week number of month
    const getWeekOfMonth = (date) => {
      const d = new Date(date);
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
      const dayOfMonth = d.getDate();
      const firstDayOfWeek = firstDay.getDay();
      return Math.ceil((dayOfMonth + firstDayOfWeek) / 7);
    };

    // Prepare schedule data (up to 6 rows)
    const templateData = {
      // Program
      program: mapProgramToThai(form.program) || "",

      month: form.month || "",

      year: form.year || "",

      // Checkboxes for user type
      check1: user.type === "อาจารย์ประจำ" ? "☑" : "☐",
      check2: user.type === "อาจารย์พิเศษ" ? "☑" : "☐",

      // Checkboxes for teaching level
      check3: user.teachingLevel === "บัณฑิตศึกษา" ? "☑" : "☐",
      check4: user.teachingLevel === "ปริญญาตรี" ? "☑" : "☐",

      // User info
      id: 1,
      name: userName,
      position: user.position || "",

      // Week fields (week of month for each schedule date)
      w1: schedules[0] ? getWeekOfMonth(schedules[0].date) : "",
      w2: schedules[1] ? getWeekOfMonth(schedules[1].date) : "",
      w3: schedules[2] ? getWeekOfMonth(schedules[2].date) : "",
      w4: schedules[3] ? getWeekOfMonth(schedules[3].date) : "",
      w5: schedules[4] ? getWeekOfMonth(schedules[4].date) : "",
      w6: schedules[5] ? getWeekOfMonth(schedules[5].date) : "",

      // Schedule dates (date1-6)
      date1: schedules[0] ? formatThaiDate(schedules[0].date) : "",
      date2: schedules[1] ? formatThaiDate(schedules[1].date) : "",
      date3: schedules[2] ? formatThaiDate(schedules[2].date) : "",
      date4: schedules[3] ? formatThaiDate(schedules[3].date) : "",
      date5: schedules[4] ? formatThaiDate(schedules[4].date) : "",
      date6: schedules[5] ? formatThaiDate(schedules[5].date) : "",

      // Subject IDs (subId1-6)
      subId1: schedules[0] ? form.subjectId : "",
      subId2: schedules[1] ? form.subjectId : "",
      subId3: schedules[2] ? form.subjectId : "",
      subId4: schedules[3] ? form.subjectId : "",
      subId5: schedules[4] ? form.subjectId : "",
      subId6: schedules[5] ? form.subjectId : "",

      // Section IDs (secId1-6)
      secId1: schedules[0] ? sectionId : "",
      secId2: schedules[1] ? sectionId : "",
      secId3: schedules[2] ? sectionId : "",
      secId4: schedules[3] ? sectionId : "",
      secId5: schedules[4] ? sectionId : "",
      secId6: schedules[5] ? sectionId : "",

      // Lecture times (lec1-6) - show time if section is LECTURE, else "-"
      lec1: schedules[0]
        ? targetSection.kind === "LECTURE"
          ? schedules[0].time
          : "-"
        : "",
      lec2: schedules[1]
        ? targetSection.kind === "LECTURE"
          ? schedules[1].time
          : "-"
        : "",
      lec3: schedules[2]
        ? targetSection.kind === "LECTURE"
          ? schedules[2].time
          : "-"
        : "",
      lec4: schedules[3]
        ? targetSection.kind === "LECTURE"
          ? schedules[3].time
          : "-"
        : "",
      lec5: schedules[4]
        ? targetSection.kind === "LECTURE"
          ? schedules[4].time
          : "-"
        : "",
      lec6: schedules[5]
        ? targetSection.kind === "LECTURE"
          ? schedules[5].time
          : "-"
        : "",

      // Lab times (lab1-6) - show time if section is LAB, else "-"
      lab1: schedules[0]
        ? targetSection.kind === "LAB"
          ? schedules[0].time
          : "-"
        : "",
      lab2: schedules[1]
        ? targetSection.kind === "LAB"
          ? schedules[1].time
          : "-"
        : "",
      lab3: schedules[2]
        ? targetSection.kind === "LAB"
          ? schedules[2].time
          : "-"
        : "",
      lab4: schedules[3]
        ? targetSection.kind === "LAB"
          ? schedules[3].time
          : "-"
        : "",
      lab5: schedules[4]
        ? targetSection.kind === "LAB"
          ? schedules[4].time
          : "-"
        : "",
      lab6: schedules[5]
        ? targetSection.kind === "LAB"
          ? schedules[5].time
          : "-"
        : "",

      // Hours (h1-6)
      h1: schedules[0] ? schedules[0].totalHour : "",
      h2: schedules[1] ? schedules[1].totalHour : "",
      h3: schedules[2] ? schedules[2].totalHour : "",
      h4: schedules[3] ? schedules[3].totalHour : "",
      h5: schedules[4] ? schedules[4].totalHour : "",
      h6: schedules[5] ? schedules[5].totalHour : "",

      // Compensation lecture times (cle1-6) - show time if section is LECTURE, else ""
      cle1: compensations[0]
        ? targetSection.kind === "LECTURE"
          ? compensations[0].newTime
          : "-"
        : "",
      cle2: compensations[1]
        ? targetSection.kind === "LECTURE"
          ? compensations[1].newTime
          : "-"
        : "",
      cle3: compensations[2]
        ? targetSection.kind === "LECTURE"
          ? compensations[2].newTime
          : "-"
        : "",
      cle4: compensations[3]
        ? targetSection.kind === "LECTURE"
          ? compensations[3].newTime
          : "-"
        : "",
      cle5: compensations[4]
        ? targetSection.kind === "LECTURE"
          ? compensations[4].newTime
          : "-"
        : "",
      cle6: compensations[5]
        ? targetSection.kind === "LECTURE"
          ? compensations[5].newTime
          : "-"
        : "",

      // Compensation lab times (cla1-6) - show time if section is LAB, else ""
      cla1: compensations[0]
        ? targetSection.kind === "LAB"
          ? compensations[0].newTime
          : "-"
        : "",
      cla2: compensations[1]
        ? targetSection.kind === "LAB"
          ? compensations[1].newTime
          : "-"
        : "",
      cla3: compensations[2]
        ? targetSection.kind === "LAB"
          ? compensations[2].newTime
          : "-"
        : "",
      cla4: compensations[3]
        ? targetSection.kind === "LAB"
          ? compensations[3].newTime
          : "-"
        : "",
      cla5: compensations[4]
        ? targetSection.kind === "LAB"
          ? compensations[4].newTime
          : "-"
        : "",
      cla6: compensations[5]
        ? targetSection.kind === "LAB"
          ? compensations[5].newTime
          : "-"
        : "",

      // Compensation hours (ch1-6) - calculated from newTime
      ch1: compensationHours[0] || "",
      ch2: compensationHours[1] || "",
      ch3: compensationHours[2] || "",
      ch4: compensationHours[3] || "",
      ch5: compensationHours[4] || "",
      ch6: compensationHours[5] || "",

      // Total hours amount and compensation total
      ht: totalHours,
      cht: totalCompensationHours,

      // Combined total (hours + compensation hours)
      th: totalHours + totalCompensationHours,
      // m1: rate per hour by section kind (LAB=300, else 600)
      m1: targetSection.kind === "LAB" ? 300 : 600,
      // m2: total payment in Thai Baht text (th * m1)
      m2:
        (totalHours + totalCompensationHours) *
        (targetSection.kind === "LAB" ? 300 : 600),
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
    const nameSlug = userName
      ? userName.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")
      : "document";
    const filename = `payment_form_${formId}_${sectionId}_${nameSlug}_${timestamp}.docx`;

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

    // Calculate total hours from schedules in the target section
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

    // Get section kind from first formScheduleDetail
    const targetSection = form.formScheduleDetails[0];
    const sectionKind = targetSection?.kind || "";

    const amount = calculateAmount(totalHours, sectionKind);

    const templateData = {
      // Form data mapped to template fields
      major: form.user.major || "",
      faculty: form.user.department || "",
      program: mapProgramToThai(form.program || "") || "",
      semester: form.semester || "",
      year: form.year || "",
      month: form.month || "",

      // User info
      id: 1,
      name: name || "",
      position: form.user.position || "",

      // Checkboxes - b1 is always checked
      b1: "✓",
      b2: form.user.teachingLevel === "ปริญญาตรี" ? "✓" : "",
      b3: form.user.teachingLevel === "บัณฑิตศึกษา" ? "✓" : "",

      // Hours and amount calculations
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
    const filename = `evidence_${nameSlug}_${timestamp}.docx`;

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
