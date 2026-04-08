declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        workspace_id?: string;
      };
    }
  }
}

export {};
