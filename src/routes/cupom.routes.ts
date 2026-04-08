import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — gestão de cupons
// ─────────────────────────────────────────────────────────────────────────────
const adminGuard = [requireAuth, requireRole("gestor")] as const;

router.get("/admin/cupons", ...adminGuard, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from("cupons")
      .select("*, workspaces(nome)")
      .order("created_at", { ascending: false });

    if (error) { res.status(500).json({ error: "Erro ao listar cupons" }); return; }
    res.json({ cupons: data });
  } catch (err) { next(err); }
});

const createCupomSchema = z.object({
  codigo:      z.string().min(3).max(30).transform((s) => s.toUpperCase().trim()),
  dias_acesso: z.coerce.number().int().min(1).max(3650),
  creditos:    z.coerce.number().int().min(0).max(100_000),
});

router.post("/admin/cupons", ...adminGuard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createCupomSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return; }

    const { data, error } = await supabase
      .from("cupons")
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      const msg = error.code === "23505" ? "Código de cupom já existe" : "Erro ao criar cupom";
      res.status(400).json({ error: msg });
      return;
    }
    res.status(201).json({ cupom: data });
  } catch (err) { next(err); }
});

router.delete("/admin/cupons/:id", ...adminGuard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: cupom } = await supabase
      .from("cupons")
      .select("usado")
      .eq("id", req.params.id)
      .single();

    if (!cupom) { res.status(404).json({ error: "Cupom não encontrado" }); return; }
    if (cupom.usado) { res.status(400).json({ error: "Não é possível excluir um cupom já utilizado" }); return; }

    await supabase.from("cupons").delete().eq("id", req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTE — aplicar cupom
// ─────────────────────────────────────────────────────────────────────────────

router.post("/cliente/cupom", requireAuth, requireRole("cliente"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    if (!workspaceId) { res.status(400).json({ error: "Workspace não encontrado" }); return; }

    const codigo = String(req.body.codigo ?? "").toUpperCase().trim();
    if (!codigo) { res.status(400).json({ error: "Código do cupom é obrigatório" }); return; }

    // Busca cupom válido (não usado)
    const { data: cupom, error: cupomErr } = await supabase
      .from("cupons")
      .select("*")
      .eq("codigo", codigo)
      .eq("usado", false)
      .maybeSingle();

    if (cupomErr || !cupom) {
      res.status(404).json({ error: "Cupom inválido ou já utilizado" });
      return;
    }

    // Busca workspace atual para somar créditos ao limite existente
    const { data: ws } = await supabase
      .from("workspaces")
      .select("limite_mensagens_mes")
      .eq("id", workspaceId)
      .single();

    const novoLimite = (ws?.limite_mensagens_mes ?? 0) + cupom.creditos;
    const novaExpiracao = new Date();
    novaExpiracao.setDate(novaExpiracao.getDate() + cupom.dias_acesso);

    await Promise.all([
      supabase.from("cupons").update({
        usado:        true,
        workspace_id: workspaceId,
        usado_em:     new Date().toISOString(),
      }).eq("id", cupom.id),

      supabase.from("workspaces").update({
        status:               "active",
        limite_mensagens_mes: novoLimite,
        trial_expira_em:      novaExpiracao.toISOString(),
      }).eq("id", workspaceId),
    ]);

    res.json({
      ok:          true,
      dias_acesso: cupom.dias_acesso,
      creditos:    cupom.creditos,
      novo_limite: novoLimite,
      expira_em:   novaExpiracao.toISOString(),
    });
  } catch (err) { next(err); }
});

export default router;
