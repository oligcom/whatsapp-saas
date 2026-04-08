import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const token = header.slice(7);

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: "Token inválido ou expirado" });
      return;
    }

    const role = (data.user.app_metadata?.role as string) ?? "vendedora";

    // Resolve workspace for vendedoras/clientes (gestores manage all workspaces)
    let workspace_id: string | undefined;
    if (role !== "gestor") {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", data.user.id)
        .maybeSingle();
      workspace_id = member?.workspace_id ?? undefined;
    }

    req.user = { id: data.user.id, email: data.user.email!, role, workspace_id };
    next();
  } catch (err) {
    res.status(500).json({ error: "Erro de autenticação" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    next();
  };
}
