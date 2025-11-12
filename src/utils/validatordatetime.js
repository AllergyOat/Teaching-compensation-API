// Helper function to parse time string to minutes
const parseTime = (timeStr) => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

// Helper function to check if start time equals end time (invalid)
export const isInvalidTimeRange = (timeRange) => {
  if (!timeRange || !timeRange.includes("-")) return true;
  
  const [startStr, endStr] = timeRange.split("-").map((t) => t.trim());
  const start = parseTime(startStr);
  const end = parseTime(endStr);
  
  // Invalid if start equals end (0 hours) or start is after end
  return start >= end;
};

// Helper function to check if two time ranges overlap
export const timeRangesOverlap = (time1, time2) => {
  const [start1Str, end1Str] = time1.split("-").map((t) => t.trim());
  const [start2Str, end2Str] = time2.split("-").map((t) => t.trim());

  const start1 = parseTime(start1Str);
  const end1 = parseTime(end1Str);
  const start2 = parseTime(start2Str);
  const end2 = parseTime(end2Str);

  // Check if ranges overlap
  return start1 < end2 && start2 < end1;
};

// Helper function to validate no duplicate time slots on the same date
export const validateNoTimeOverlap = (formScheduleDetails) => {
  const schedulesByDate = {};
  const invalidTimeRanges = [];

  // Group all schedules by date and check for invalid time ranges
  formScheduleDetails.forEach((detail) => {
    if (detail.schedules && Array.isArray(detail.schedules)) {
      detail.schedules.forEach((schedule) => {
        // Check if time range is invalid (start >= end)
        if (isInvalidTimeRange(schedule.time)) {
          invalidTimeRanges.push({
            date: new Date(schedule.date).toISOString().split("T")[0],
            time: schedule.time,
            topic: schedule.topic,
            lectureId: detail.lectureId,
            reason: "เวลาเริ่มต้นและสิ้นสุดต้องไม่เท่ากัน และเวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด"
          });
        }

        const dateKey = new Date(schedule.date).toISOString().split("T")[0];
        if (!schedulesByDate[dateKey]) {
          schedulesByDate[dateKey] = [];
        }
        schedulesByDate[dateKey].push({
          time: schedule.time,
          topic: schedule.topic,
          lectureId: detail.lectureId,
        });
      });
    }
  });

  // Return invalid time ranges first if found
  if (invalidTimeRanges.length > 0) {
    return invalidTimeRanges.map(invalid => ({
      date: invalid.date,
      time1: invalid.time,
      topic1: invalid.topic,
      lectureId1: invalid.lectureId,
      isInvalidRange: true,
      reason: invalid.reason
    }));
  }

  // Check for overlaps within each date
  const conflicts = [];
  for (const [date, schedules] of Object.entries(schedulesByDate)) {
    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        if (timeRangesOverlap(schedules[i].time, schedules[j].time)) {
          conflicts.push({
            date,
            time1: schedules[i].time,
            time2: schedules[j].time,
            topic1: schedules[i].topic,
            topic2: schedules[j].topic,
            lectureId1: schedules[i].lectureId,
            lectureId2: schedules[j].lectureId,
            isInvalidRange: false
          });
        }
      }
    }
  }

  return conflicts;
};
