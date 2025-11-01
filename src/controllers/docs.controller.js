import fs from "fs";
import path, { format } from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import prisma from "../config/prisma.js";
import { fileURLToPath } from "url";
import {
  formatThaiDate,
  mapProgramToThai,
  formatNumber,
} from "../utils/formatter.js";
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
      sch: targetSchedules.map((schedule, index) => ({
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

    const totalAmount =
      (totalHours + totalCompensationHours) *
      (targetSection.kind === "LAB" ? 300 : 600);

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

      // Helper function to parse time range
      parseTime: (timeStr) => {
        if (!timeStr) return { start: "", end: "" };
        const match = timeStr.match(
          /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
        );
        if (!match) return { start: timeStr, end: "" };
        return { start: match[1], end: match[2] };
      },

      // Lecture start times (lec1-6) - show start time if section is LECTURE, else "-"
      lec1: schedules[0]
        ? targetSection.kind === "LECTURE"
          ? schedules[0].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[0].time
          : ""
        : "",
      lec2: schedules[1]
        ? targetSection.kind === "LECTURE"
          ? schedules[1].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[1].time
          : ""
        : "",
      lec3: schedules[2]
        ? targetSection.kind === "LECTURE"
          ? schedules[2].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[2].time
          : ""
        : "",
      lec4: schedules[3]
        ? targetSection.kind === "LECTURE"
          ? schedules[3].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[3].time
          : ""
        : "",
      lec5: schedules[4]
        ? targetSection.kind === "LECTURE"
          ? schedules[4].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[4].time
          : ""
        : "",
      lec6: schedules[5]
        ? targetSection.kind === "LECTURE"
          ? schedules[5].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[5].time
          : ""
        : "",

      // Lecture end times (lec11-66) - show end time with "น." if section is LECTURE, else "-"
      lec11: schedules[0]
        ? targetSection.kind === "LECTURE"
          ? (schedules[0].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[0].time.includes("-") ? " น." : "")
          : ""
        : "",
      lec22: schedules[1]
        ? targetSection.kind === "LECTURE"
          ? (schedules[1].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[1].time.includes("-") ? " น." : "")
          : ""
        : "",
      lec33: schedules[2]
        ? targetSection.kind === "LECTURE"
          ? (schedules[2].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[2].time.includes("-") ? " น." : "")
          : ""
        : "",
      lec44: schedules[3]
        ? targetSection.kind === "LECTURE"
          ? (schedules[3].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[3].time.includes("-") ? " น." : "")
          : ""
        : "",
      lec55: schedules[4]
        ? targetSection.kind === "LECTURE"
          ? (schedules[4].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[4].time.includes("-") ? " น." : "")
          : ""
        : "",
      lec66: schedules[5]
        ? targetSection.kind === "LECTURE"
          ? (schedules[5].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[5].time.includes("-") ? " น." : "")
          : ""
        : "",

      // Lab start times (lab1-6) - show start time if section is LAB, else "-"
      lab1: schedules[0]
        ? targetSection.kind === "LAB"
          ? schedules[0].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[0].time
          : ""
        : "",
      lab2: schedules[1]
        ? targetSection.kind === "LAB"
          ? schedules[1].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[1].time
          : ""
        : "",
      lab3: schedules[2]
        ? targetSection.kind === "LAB"
          ? schedules[2].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[2].time
          : ""
        : "",
      lab4: schedules[3]
        ? targetSection.kind === "LAB"
          ? schedules[3].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[3].time
          : ""
        : "",
      lab5: schedules[4]
        ? targetSection.kind === "LAB"
          ? schedules[4].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[4].time
          : ""
        : "",
      lab6: schedules[5]
        ? targetSection.kind === "LAB"
          ? schedules[5].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || schedules[5].time
          : ""
        : "",

      // Lab end times (lab11-66) - show end time with "น." if section is LAB, else "-"
      lab11: schedules[0]
        ? targetSection.kind === "LAB"
          ? (schedules[0].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[0].time.includes("-") ? " น." : "")
          : ""
        : "",
      lab22: schedules[1]
        ? targetSection.kind === "LAB"
          ? (schedules[1].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[1].time.includes("-") ? " น." : "")
          : ""
        : "",
      lab33: schedules[2]
        ? targetSection.kind === "LAB"
          ? (schedules[2].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[2].time.includes("-") ? " น." : "")
          : ""
        : "",
      lab44: schedules[3]
        ? targetSection.kind === "LAB"
          ? (schedules[3].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[3].time.includes("-") ? " น." : "")
          : ""
        : "",
      lab55: schedules[4]
        ? targetSection.kind === "LAB"
          ? (schedules[4].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[4].time.includes("-") ? " น." : "")
          : ""
        : "",
      lab66: schedules[5]
        ? targetSection.kind === "LAB"
          ? (schedules[5].time.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") + (schedules[5].time.includes("-") ? " น." : "")
          : ""
        : "",

      // Hours (h1-6)
      h1: schedules[0] ? schedules[0].totalHour : "",
      h2: schedules[1] ? schedules[1].totalHour : "",
      h3: schedules[2] ? schedules[2].totalHour : "",
      h4: schedules[3] ? schedules[3].totalHour : "",
      h5: schedules[4] ? schedules[4].totalHour : "",
      h6: schedules[5] ? schedules[5].totalHour : "",

      // Compensation lecture start times (cle1-6) - show start time if section is LECTURE, else "-"
      cle1: compensations[0]
        ? targetSection.kind === "LECTURE"
          ? compensations[0].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[0].newTime
          : ""
        : "",
      cle2: compensations[1]
        ? targetSection.kind === "LECTURE"
          ? compensations[1].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[1].newTime
          : ""
        : "",
      cle3: compensations[2]
        ? targetSection.kind === "LECTURE"
          ? compensations[2].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[2].newTime
          : ""
        : "",
      cle4: compensations[3]
        ? targetSection.kind === "LECTURE"
          ? compensations[3].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[3].newTime
          : ""
        : "",
      cle5: compensations[4]
        ? targetSection.kind === "LECTURE"
          ? compensations[4].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[4].newTime
          : ""
        : "",
      cle6: compensations[5]
        ? targetSection.kind === "LECTURE"
          ? compensations[5].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[5].newTime
          : ""
        : "",

      // Compensation lecture end times (cle11-66) - show end time with "น." if section is LECTURE, else "-"
      cle11: compensations[0]
        ? targetSection.kind === "LECTURE"
          ? (compensations[0].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[0].newTime.includes("-") ? " น." : "")
          : ""
        : "",
      cle22: compensations[1]
        ? targetSection.kind === "LECTURE"
          ? (compensations[1].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[1].newTime.includes("-") ? " น." : "")
          : ""
        : "",
      cle33: compensations[2]
        ? targetSection.kind === "LECTURE"
          ? (compensations[2].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[2].newTime.includes("-") ? " น." : "")
          : ""
        : "",
      cle44: compensations[3]
        ? targetSection.kind === "LECTURE"
          ? (compensations[3].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[3].newTime.includes("-") ? " น." : "")
          : ""
        : "",
      cle55: compensations[4]
        ? targetSection.kind === "LECTURE"
          ? (compensations[4].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[4].newTime.includes("-") ? " น." : "")
          : ""
        : "",
      cle66: compensations[5]
        ? targetSection.kind === "LECTURE"
          ? (compensations[5].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[5].newTime.includes("-") ? " น." : "")
          : ""
        : "",

      // Compensation lab start times (cla1-6) - show start time if section is LAB, else "-"
      cla1: compensations[0]
        ? targetSection.kind === "LAB"
          ? compensations[0].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[0].newTime
          : ""
        : "",
      cla2: compensations[1]
        ? targetSection.kind === "LAB"
          ? compensations[1].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[1].newTime
          : ""
        : "",
      cla3: compensations[2]
        ? targetSection.kind === "LAB"
          ? compensations[2].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[2].newTime
          : ""
        : "",
      cla4: compensations[3]
        ? targetSection.kind === "LAB"
          ? compensations[3].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[3].newTime
          : ""
        : "",
      cla5: compensations[4]
        ? targetSection.kind === "LAB"
          ? compensations[4].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[4].newTime
          : ""
        : "",
      cla6: compensations[5]
        ? targetSection.kind === "LAB"
          ? compensations[5].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[1] || compensations[5].newTime
          : ""
        : "",

      // Compensation lab end times (cla11-66) - show end time with "น." if section is LAB, else "-"
      cla11: compensations[0]
        ? targetSection.kind === "LAB"
          ? (compensations[0].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[0].newTime.includes("-") ? " น." : "")
          : ""
        : "",
      cla22: compensations[1]
        ? targetSection.kind === "LAB"
          ? (compensations[1].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[1].newTime.includes("-") ? " น." : "")
          : ""
        : "",
      cla33: compensations[2]
        ? targetSection.kind === "LAB"
          ? (compensations[2].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[2].newTime.includes("-") ? " น." : "")
          : ""
        : "",
      cla44: compensations[3]
        ? targetSection.kind === "LAB"
          ? (compensations[3].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[3].newTime.includes("-") ? " น." : "")
          : ""
        : "",
      cla55: compensations[4]
        ? targetSection.kind === "LAB"
          ? (compensations[4].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[4].newTime.includes("-") ? " น." : "")
          : ""
        : "",
      cla66: compensations[5]
        ? targetSection.kind === "LAB"
          ? (compensations[5].newTime.match(
              /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/
            )?.[2] || "") +
            (compensations[5].newTime.includes("-") ? " น." : "")
          : ""
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
      m2: formatNumber(totalAmount),
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
            compensation: true,
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
    const totalScheduleHours = Array.isArray(form.formScheduleDetails)
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

    // Calculate total compensation hours
    const totalCompensationHours = Array.isArray(form.formScheduleDetails)
      ? form.formScheduleDetails.reduce((sum, section) => {
          if (section.compensation && Array.isArray(section.compensation)) {
            return (
              sum +
              section.compensation.reduce(
                (compSum, comp) => compSum + calculateTotalHours(comp.newTime),
                0
              )
            );
          }
          return sum;
        }, 0)
      : 0;

    // Combined total hours (schedules + compensation)
    const totalHours = totalScheduleHours + totalCompensationHours;

    // Get section kind from first formScheduleDetail
    const targetSection = form.formScheduleDetails[0];
    const formSection = form.section || "";

    const amount = calculateAmount(totalHours, targetSection?.kind);

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

      // Hours and amount calculations (includes both schedule and compensation hours)
      hours: totalHours.toString(),
      amount: formatNumber(amount),
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

export const generateSummaryScheduleDocx = async (req, res) => {
  try {
    console.log("Generate Summary Schedule DOCX request received");

    const { formId, sectionId } = req.params;

    if (!formId) {
      return res.status(400).json({
        error: "Form ID is required",
      });
    }

    console.log("Fetching form data for formId:", formId);

    // Fetch form data
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
        formId,
      });
    }

    console.log("Form found:", form);

    // Path to summary schedule template file
    const templatePath = path.join(
      __dirname,
      "../templates/output/OUTPUT3.docx"
    );

    if (!fs.existsSync(templatePath)) {
      console.error("Template file not found at:", templatePath);
      return res.status(500).json({
        error: "Summary schedule template file not found",
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
    const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim();

    // Get target section for calculating m1 and m2
    const targetSection = form.formScheduleDetails[0];

    // Calculate total hours from all schedules
    const totalHours = form.formScheduleDetails.reduce((sum, section) => {
      return (
        sum +
        (section.schedules || []).reduce((schedSum, schedule) => {
          return schedSum + (parseFloat(schedule.totalHour) || 0);
        }, 0)
      );
    }, 0);

    // Calculate m1 (rate per hour) based on section kind
    const m1 = targetSection?.kind === "LAB" ? 300 : 600;

    // Calculate m2 (total amount)
    const totalAmount = totalHours * m1;
    const m2 = formatNumber(totalAmount);

    // Prepare semester checkboxes
    const check1 = form.semester === "ภาคต้น" ? "☑" : "☐";
    const check2 = form.semester === "ภาคปลาย" ? "☑" : "☐";
    const check3 = form.semester === "ภาคฤดูร้อน" ? "☑" : "☐";

    // Helper function to get Thai day name from date
    const getThaiDayName = (date) => {
      const days = [
        "วันอาทิตย์",
        "วันจันทร์",
        "วันอังคาร",
        "วันพุธ",
        "วันพฤหัสบดี",
        "วันศุกร์",
        "วันเสาร์",
      ];
      const d = new Date(date);
      return days[d.getDay()];
    };

    // Helper function to parse time range and return start/end hour
    const parseTimeRange = (timeStr) => {
      // Examples: "07.00-08.30", "13.00-16.00", "08:30-10:00"
      if (!timeStr) return null;

      const match = timeStr.match(
        /(\d{1,2})[:.:](\d{2})\s*[-–]\s*(\d{1,2})[:.:](\d{2})/
      );
      if (!match) return null;

      const startHour = parseInt(match[1]);
      const startMin = parseInt(match[2]);
      const endHour = parseInt(match[3]);
      const endMin = parseInt(match[4]);

      return { startHour, startMin, endHour, endMin };
    };

    // Helper function to map time to cell index (b11-b38)
    // b11=7:00, b12=7:30, b13=8:00, b14=8:30, ..., b38=20:30
    const getTimeCellIndex = (hour, minute) => {
      // Starting from 7:00 AM (index 1)
      // Each 30-minute slot increments index by 1
      const baseHour = 7;
      if (hour < baseHour || hour > 20) return -1;

      const hourOffset = (hour - baseHour) * 2;
      const minOffset = minute >= 30 ? 1 : 0;
      return hourOffset + minOffset + 1; // +1 because b11 is index 1
    };

    // Group schedules by day
    const schedulesByDay = {};
    form.formScheduleDetails.forEach((section) => {
      (section.schedules || []).forEach((schedule) => {
        const dayName = getThaiDayName(schedule.date);
        if (!schedulesByDay[dayName]) {
          schedulesByDay[dayName] = [];
        }
        schedulesByDay[dayName].push({
          time: schedule.time,
          subjectName: form.subjectName,
          subjectId: form.subjectId,
          sectionId: section.sectionId,
          kind: section.kind,
        });
      });
    });

    // Prepare table rows for each day
    const thaiDays = [
      "วันจันทร์",
      "วันอังคาร",
      "วันพุธ",
      "วันพฤหัสบดี",
      "วันศุกร์",
      "วันเสาร์",
      "วันอาทิตย์",
    ];
    const tableRows = thaiDays.map((dayName) => {
      // Initialize empty row
      const row = {
        dayName,
        a11: "",
        a12: "",
        a13: "",
        a14: "",
        a15: "",
        a16: "",
        a17: "",
        a18: "",
        a19: "",
        a20: "",
        a21: "",
        a22: "",
        a23: "",
        a24: "",
        a25: "",
        a26: "",
        a27: "",
        a28: "",
        a29: "",
        a30: "",
        a31: "",
        a32: "",
        a33: "",
        a34: "",
        a35: "",
        a36: "",
        a37: "",
        a38: "",
        b11: "",
        b12: "",
        b13: "",
        b14: "",
        b15: "",
        b16: "",
        b17: "",
        b18: "",
        b19: "",
        b20: "",
        b21: "",
        b22: "",
        b23: "",
        b24: "",
        b25: "",
        b26: "",
        b27: "",
        b28: "",
        b29: "",
        b30: "",
        b31: "",
        b32: "",
        b33: "",
        b34: "",
        b35: "",
        b36: "",
        b37: "",
        b38: "",
      };

      // Fill in schedule data for this day
      const daySchedules = schedulesByDay[dayName] || [];
      daySchedules.forEach((schedule) => {
        const timeRange = parseTimeRange(schedule.time);
        if (!timeRange) return;

        const startIndex = getTimeCellIndex(
          timeRange.startHour,
          timeRange.startMin
        );
        const endIndex = getTimeCellIndex(timeRange.endHour, timeRange.endMin);

        if (startIndex < 1 || endIndex > 28) return;

        // The end arrow should be one slot before the end time
        const endArrowIndex = endIndex - 1;

        // Calculate middle index for placing subject info
        const middleIndex = Math.floor((startIndex + endArrowIndex) / 2);

        // Fill b cells with arrow markers
        for (let i = startIndex; i <= endArrowIndex; i++) {
          const cellKey = `b${i < 10 ? "1" : i < 20 ? "2" : "3"}${i % 10}`;

          if (i === startIndex) {
            row[cellKey] = "<----------";
          } else if (i === endArrowIndex) {
            row[cellKey] = "---------->";
          } else if (i > startIndex && i < endArrowIndex) {
            row[cellKey] = "------------";
          }
        }

        // Fill a cells with subject info at the middle position
        const aCellKey1 = `a${
          middleIndex < 10 ? "1" : middleIndex < 20 ? "2" : "3"
        }${middleIndex % 10}`;
        const aCellKey2 = `a${
          middleIndex + 1 < 10 ? "1" : middleIndex + 1 < 20 ? "2" : "3"
        }${(middleIndex + 1) % 10}`;

        // a11 (or middle position) = subjectId
        row[aCellKey1] = schedule.subjectId || "";

        // a12 (or middle position + 1) = sectionId with optional kind label
        // If form.section is LECTURE, show "หมู่ " prefix instead of kind label
        if (form.section === "LECTURE") {
          row[aCellKey2] = `หมู่ ${schedule.sectionId}`;
        } else {
          const kindLabel = schedule.kind === "LAB" ? "lab" : "lact";
          row[aCellKey2] = `(${kindLabel}) ${schedule.sectionId}`;
        }
      });

      return row;
    });

    // Prepare template data
    const templateData = {
      name: userName,
      degree: user.degree || "",
      position: user.position || "",
      major: user.major || "",
      program: mapProgramToThai(form.program) || "",
      department: user.department || "",
      faculty: user.faculty || "",
      year: form.year || "",
      check1,
      check2,
      check3,
      m1,
      m2,
      totalHour: totalHours,
      tr: tableRows,
    };

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
      : "summary";
    const filename = `summary_schedule_${formId}_${nameSlug}_${timestamp}.docx`;

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
    console.error("Generate Summary Schedule DOCX error:", error);

    // Handle specific errors
    if (error.message.includes("ENOENT")) {
      return res.status(500).json({
        error: "Template file not found",
        details:
          "The summary schedule template file is missing from the templates folder",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Failed to generate summary schedule document",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};
