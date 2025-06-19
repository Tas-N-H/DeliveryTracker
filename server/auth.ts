import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export interface AuthenticatedRequest extends Request {
  restaurantId?: number;
  restaurant?: any;
}

export function generateToken(restaurantId: number): string {
  return jwt.sign({ restaurantId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { restaurantId: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return { restaurantId: decoded.restaurantId };
  } catch (error) {
    return null;
  }
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: "Invalid token" });
  }

  try {
    const restaurant = await storage.getRestaurant(decoded.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    req.restaurantId = decoded.restaurantId;
    req.restaurant = restaurant;
    next();
  } catch (error) {
    return res.status(500).json({ error: "Authentication failed" });
  }
}