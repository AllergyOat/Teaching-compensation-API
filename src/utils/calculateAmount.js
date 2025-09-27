export const calculateAmount = (hours, section) => {
  if (section === "LECTURE") {
    return hours * 600;
  }

  if (section === "LAB") {
    return hours * 300;
  }
}