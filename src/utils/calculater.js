export const calculateAmount = (hours, section) => {
  if (section === "LECTURE") {
    return hours * 600;
  }

  if (section === "LAB") {
    return hours * 300;
  }
}

export function calculateTotalHours(timeRange) {
  if (!timeRange || !timeRange.includes("-")) return 0;

  const [start, end] = timeRange.split("-").map((t) => t.trim());

  // Convert "HH:MM" to minutes
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  // Handle times like 13:30–14:00 properly
  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);

  // If time wraps around midnight (rare but possible)
  const diffMinutes = endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : 24 * 60 - (startMinutes - endMinutes);

  // Convert minutes to hours (2 decimal places)
  return diffMinutes / 60;
}