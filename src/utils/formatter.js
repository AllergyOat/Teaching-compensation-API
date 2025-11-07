export const formatThaiDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const day = date.getDate();
  const thaiYear = date.getFullYear() + 543;
  const shortYear = String(thaiYear).slice(-2);

  const thaiMonths = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];

  const month = thaiMonths[date.getMonth()];
  return `${day} ${month} ${shortYear}`;
};

export const mapProgramToThai = (program) => {
  const programMap = {
    REGULAR_PROGRAM: "ภาคปกติ",
    SPECIAL_PROGRAM: "ภาคพิเศษ",
  };
  return programMap[program] || program || "";
};


export function formatNumber(value) {
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString('en-US');
}