import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getConnection } from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        username: string;
        email: string;
      };
    }
  }
}

/**
 * Login endpoint - authenticates user and returns JWT token
 * POST /api/auth/login
 * Body: { username: string, password: string }
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: { message: 'Username and password are required' }
      });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT UserId, Username, PasswordHash, Email, FullName, IsActive
        FROM auth.[User]
        WHERE Username = @username
      `);

    if (result.recordset.length === 0) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid username or password' }
      });
      return;
    }

    const user = result.recordset[0];

    if (!user.IsActive) {
      res.status(403).json({
        success: false,
        error: { message: 'Account is inactive' }
      });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.PasswordHash);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid username or password' }
      });
      return;
    }

    // Update last login
    await pool.request()
      .input('userId', sql.Int, user.UserId)
      .query(`
        UPDATE auth.[User]
        SET LastLoginAt = SYSDATETIME()
        WHERE UserId = @userId
      `);

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.UserId,
        username: user.Username,
        email: user.Email
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          userId: user.UserId,
          username: user.Username,
          email: user.Email,
          fullName: user.FullName
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify token endpoint - validates JWT token
 * GET /api/auth/verify
 * Headers: Authorization: Bearer <token>
 */
export const verify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // This endpoint is protected by authMiddleware, so if we get here, token is valid
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user info
 * GET /api/auth/me
 * Headers: Authorization: Bearer <token>
 */
export const getCurrentUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { message: 'Not authenticated' }
      });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`
        SELECT UserId, Username, Email, FullName, IsActive, CreatedAt, LastLoginAt
        FROM auth.[User]
        WHERE UserId = @userId
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({
        success: false,
        error: { message: 'User not found' }
      });
      return;
    }

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (error) {
    next(error);
  }
};
