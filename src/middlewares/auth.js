import { verifyToken } from "../utils/jwt.js";
import prisma from "../config/prisma.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    const [, token] = header.split(" ");
    if (!token) {
      console.log("No token found in header");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = verifyToken(token); // { sub, role, email }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    console.log("User found:", user);

    if (!user) return res.status(401).json({ message: "Unauthorized" });
    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function permit(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}
