import { Request } from 'express';

/**
 * Single-workspace identity (contract §1): every authenticated identity
 * (session OR token) has full CRUD on all data. No user id, no ownership —
 * just the email for display/audit and the mechanism used.
 */
export interface AuthContext {
  email: string;
  via: 'session' | 'token';
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}
