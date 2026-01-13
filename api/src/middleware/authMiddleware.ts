import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Authentication middleware - verifies JWT token
 * Protects routes that require authentication
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { message: 'No token provided. Authorization header must be: Bearer <token>' }
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: number;
        username: string;
        email: string;
      };

      // Attach user info to request
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email
      };

      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid or expired token' }
      });
      return;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Authentication error' }
    });
    return;
  }
};
