import { Request, Response, NextFunction } from "express";
import jwt, { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key_change_me";

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        email: string;
    };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        next();
    } catch (err) {
        if (err instanceof TokenExpiredError) {
            return res.status(401).json({ error: "Token expired. Please log in again." });
        }
        if (err instanceof JsonWebTokenError) {
            return res.status(403).json({ error: "Invalid token. Please log in again." });
        }
        return res.status(403).json({ error: "Invalid token. Please log in again." });
    }
};
