import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();
const guard = [requireAuth, requireRole("gestor")] as const;

// ── Listar usuários ───────────────────────────────────────────────────────────

router.get("/admin/usuarios", ...guard, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) { res.status(500).json({ error: "Erro ao listar usuários" }); return; }

    const usuarios = data.users.map((u) => ({
      id: u.id,
      email: u.email,
      role: (u.app_metadata?.role as string) ?? "vendedora",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }));

    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id, workspace_id");

    const memberMap = Object.fromEntries(
      (members ?? []).map((m) => [m.user_id, m.workspace_id])
    );

    res.json({
      usuarios: usuarios.map((u) => ({
        ...u,
        workspace_id: memberMap[u.id] ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── Criar vendedora ───────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email:        z.string().email(),
  password:     z.string().min(8, "Mínimo 8 caracteres"),
  workspace_id: z.string().uuid("workspace_id inválido"),
  role:         z.enum(["vendedora", "cliente"]).default("vendedora"),
});

router.post("/admin/usuarios", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { email, password, workspace_id, role } = parsed.data;

    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspace_id)
      .single();

    if (wsErr || !ws) { res.status(404).json({ error: "Workspace não encontrado" }); return; }

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
    });

    if (authErr || !authData.user) {
      const msg = authErr?.message ?? "Erro ao criar usuário";
      res.status(400).json({ error: msg });
      return;
    }

    const { error: memberErr } = await supabase
      .from("workspace_members")
      .insert({ workspace_id, user_id: authData.user.id });

    if (memberErr) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      res.status(500).json({ error: "Erro ao vincular usuária ao workspace" });
      return;
    }

    res.status(201).json({
      usuario: {
        id: authData.user.id,
        email: authData.user.email,
        workspace_id,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Editar usuária ────────────────────────────────────────────────────────────

const editUserSchema = z.object({
  email:        z.string().email().optional(),
  password:     z.string().min(8, "Mínimo 8 caracteres").optional(),
  workspace_id: z.string().uuid("workspace_id inválido").nullable().optional(),
  role:         z.enum(["vendedora", "gestor", "cliente"]).optional(),
});

router.patch("/admin/usuarios/:id", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const parsed = editUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { email, password, workspace_id, role } = parsed.data;

    // Build Auth update payload (only changed fields)
    const authUpdate: Parameters<typeof supabase.auth.admin.updateUserById>[1] = {};
    if (email !== undefined)    authUpdate.email    = email;
    if (password !== undefined) authUpdate.password = password;
    if (role !== undefined)     authUpdate.app_metadata = { role };

    if (Object.keys(authUpdate).length > 0) {
      const { error: authErr } = await supabase.auth.admin.updateUserById(id, authUpdate);
      if (authErr) {
        res.status(400).json({ error: authErr.message });
        return;
      }
    }

    // Update workspace membership if explicitly provided
    if (workspace_id !== undefined) {
      await supabase.from("workspace_members").delete().eq("user_id", id);
      if (workspace_id !== null) {
        const { error: memberErr } = await supabase
          .from("workspace_members")
          .insert({ workspace_id, user_id: id });
        if (memberErr) {
          res.status(500).json({ error: "Erro ao atualizar workspace" });
          return;
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
