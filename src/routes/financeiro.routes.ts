import { Router, Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asaasService } from "../services/asaas.service";

const router = Router();
const guard = [requireAuth, requireRole("gestor")] as const;

// ── Resumo ────────────────────────────────────────────────────────────────────

router.get("/admin/financeiro/resumo", ...guard, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, status, asaas_subscription_id");

    if (error) { res.status(500).json({ error: "Erro ao buscar workspaces" }); return; }

    const ws = data ?? [];
    const ativos      = ws.filter(w => w.status === "active").length;
    const trial       = ws.filter(w => w.status === "trial" || w.status === "demo").length;
    const suspensos   = ws.filter(w => w.status === "suspended").length;
    const comAssinatura = ws.filter(w => w.asaas_subscription_id).length;
    const mrrEstimado = ws.filter(w => w.status === "active" && w.asaas_subscription_id).length * 49.90;

    res.json({ total: ws.length, ativos, trial, suspensos, comAssinatura, mrrEstimado });
  } catch (err) {
    next(err);
  }
});

// ── Listar assinaturas ────────────────────────────────────────────────────────

router.get("/admin/financeiro/assinaturas", ...guard, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, nome, status, asaas_subscription_id, asaas_customer_id, email_contato, cnpj, created_at")
      .order("created_at", { ascending: false });

    if (error) { res.status(500).json({ error: "Erro ao buscar workspaces" }); return; }

    const ws = data ?? [];
    const comSub = ws.filter(w => w.asaas_subscription_id);

    const statusResults = await Promise.allSettled(
      comSub.map(w => asaasService.buscarAssinatura(w.asaas_subscription_id!))
    );

    const asaasMap: Record<string, any> = {};
    comSub.forEach((w, i) => {
      const r = statusResults[i];
      if (r.status === "fulfilled") asaasMap[w.asaas_subscription_id!] = r.value;
    });

    const assinaturas = ws.map(w => ({
      ...w,
      asaas: w.asaas_subscription_id ? (asaasMap[w.asaas_subscription_id] ?? null) : null,
    }));

    res.json({ assinaturas });
  } catch (err) {
    next(err);
  }
});

// ── Histórico de cobranças ────────────────────────────────────────────────────

router.get("/admin/financeiro/assinaturas/:subscriptionId/cobrancas", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await asaasService.listarCobrancas(req.params.subscriptionId as string);
    res.json(data);
  } catch (err: any) {
    if (err.response?.status === 404) { res.status(404).json({ error: "Assinatura não encontrada" }); return; }
    next(err);
  }
});

// ── Cancelar assinatura ───────────────────────────────────────────────────────

router.post("/admin/financeiro/assinaturas/:subscriptionId/cancelar", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptionId = req.params.subscriptionId as string;
    await asaasService.cancelarAssinatura(subscriptionId);

    await supabase
      .from("workspaces")
      .update({ status: "suspended" })
      .eq("asaas_subscription_id", subscriptionId);

    res.json({ ok: true });
  } catch (err: any) {
    if (err.response?.status === 404) { res.status(404).json({ error: "Assinatura não encontrada" }); return; }
    next(err);
  }
});

// ── Gerar segunda via (PIX QR Code) ──────────────────────────────────────────

router.post("/admin/financeiro/cobrancas/:paymentId/segunda-via", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await asaasService.gerarSegundaVia(req.params.paymentId as string);
    res.json(data);
  } catch (err: any) {
    if (err.response?.status === 404) { res.status(404).json({ error: "Cobrança não encontrada" }); return; }
    next(err);
  }
});

export default router;
