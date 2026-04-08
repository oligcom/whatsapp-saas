import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();
const guard = [requireAuth, requireRole("cliente")] as const;

const MAX_VENDEDORAS = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function listarVendedorasDoWorkspace(workspaceId: string) {
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);

  if (!members?.length) return [];

  const { data: authData } = await supabase.auth.admin.listUsers();
  const memberIds = new Set(members.map((m) => m.user_id));

  return (authData?.users ?? [])
    .filter((u) => memberIds.has(u.id) && u.app_metadata?.role === "vendedora")
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }));
}

// ── Listar vendedoras do workspace ────────────────────────────────────────────

router.get("/cliente/equipe", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    if (!workspaceId) { res.status(400).json({ error: "Workspace não encontrado" }); return; }

    const vendedoras = await listarVendedorasDoWorkspace(workspaceId);
    res.json({ vendedoras, total: vendedoras.length, limite: MAX_VENDEDORAS });
  } catch (err) { next(err); }
});

// ── Criar vendedora ───────────────────────────────────────────────────────────

const createSchema = z.object({
  email:    z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

router.post("/cliente/equipe", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    if (!workspaceId) { res.status(400).json({ error: "Workspace não encontrado" }); return; }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return; }

    const vendedoras = await listarVendedorasDoWorkspace(workspaceId);
    if (vendedoras.length >= MAX_VENDEDORAS) {
      res.status(400).json({ error: `Limite de ${MAX_VENDEDORAS} vendedoras atingido` });
      return;
    }

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email:         parsed.data.email,
      password:      parsed.data.password,
      email_confirm: true,
      app_metadata:  { role: "vendedora" },
    });

    if (authErr || !authData.user) {
      res.status(400).json({ error: authErr?.message ?? "Erro ao criar vendedora" });
      return;
    }

    const { error: memberErr } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: workspaceId, user_id: authData.user.id });

    if (memberErr) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      res.status(500).json({ error: "Erro ao vincular vendedora ao workspace" });
      return;
    }

    res.status(201).json({ vendedora: { id: authData.user.id, email: authData.user.email } });
  } catch (err) { next(err); }
});

// ── Editar vendedora (email e/ou senha) ───────────────────────────────────────

const updateSchema = z.object({
  email:    z.string().email("Email inválido").optional(),
  password: z.string().min(8, "Mínimo 8 caracteres").optional(),
}).refine((d) => d.email || d.password, { message: "Informe email ou senha para atualizar" });

router.patch("/cliente/equipe/:id", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    const vendedoraId = req.params.id;
    if (!workspaceId) { res.status(400).json({ error: "Workspace não encontrado" }); return; }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return; }

    // Garante que esta vendedora pertence ao workspace do cliente
    const { data: member } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", vendedoraId)
      .maybeSingle();

    if (!member) { res.status(404).json({ error: "Vendedora não encontrada neste workspace" }); return; }

    // Garante que é realmente uma vendedora (não gestor/cliente)
    const { data: authUser } = await supabase.auth.admin.getUserById(vendedoraId);
    if (!authUser?.user || authUser.user.app_metadata?.role !== "vendedora") {
      res.status(400).json({ error: "Usuário não é uma vendedora" });
      return;
    }

    const update: { email?: string; password?: string } = {};
    if (parsed.data.email)    update.email    = parsed.data.email;
    if (parsed.data.password) update.password = parsed.data.password;

    const { error } = await supabase.auth.admin.updateUserById(vendedoraId, update);
    if (error) { res.status(400).json({ error: error.message }); return; }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
