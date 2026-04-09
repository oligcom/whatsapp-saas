import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asaasService } from "../services/asaas.service";

const router = Router();
const guard = [requireAuth, requireRole("cliente")] as const;

// ── Stats do workspace ────────────────────────────────────────────────────────

router.get("/cliente/stats", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    if (!workspaceId) {
      res.status(400).json({ error: "Workspace não encontrado para este usuário" });
      return;
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Contagens diretas
    const [{ count: hoje }, { count: mes }, wsResult, mensagensResult, avaliacoesResult] = await Promise.all([
      supabase
        .from("mensagens")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("created_at", startOfDay),
      supabase
        .from("mensagens")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("created_at", startOfMonth),
      supabase
        .from("workspaces")
        .select("limite_mensagens_mes")
        .eq("id", workspaceId)
        .single(),
      supabase
        .from("mensagens")
        .select("usuario_id, tipo_mensagem, created_at")
        .eq("workspace_id", workspaceId)
        .gte("created_at", startOfMonth),
      supabase
        .from("mensagens")
        .select("avaliacao")
        .eq("workspace_id", workspaceId)
        .not("avaliacao", "is", null),
    ]);

    const mensagens = mensagensResult.data ?? [];

    // Média de avaliações (todas as mensagens com avaliação do workspace)
    const avaliacoes = (avaliacoesResult.data ?? []).map((m) => m.avaliacao as number);
    const media_avaliacoes = avaliacoes.length
      ? Math.round((avaliacoes.reduce((a, b) => a + b, 0) / avaliacoes.length) * 10) / 10
      : null;

    // Agregações via JS
    const rankingMap: Record<string, number> = {};
    const horaMap: Record<number, number> = {};
    const tipoMap: Record<string, number> = {};

    for (const m of mensagens) {
      rankingMap[m.usuario_id] = (rankingMap[m.usuario_id] ?? 0) + 1;
      const hora = new Date(m.created_at).getHours();
      horaMap[hora] = (horaMap[hora] ?? 0) + 1;
      tipoMap[m.tipo_mensagem] = (tipoMap[m.tipo_mensagem] ?? 0) + 1;
    }

    // Busca e-mails dos usuários do ranking
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const emailMap = Object.fromEntries(
      (authUsers?.users ?? []).map((u) => [u.id, u.email ?? u.id])
    );

    const ranking_vendedoras = Object.entries(rankingMap)
      .map(([id, total]) => ({ usuario_id: id, email: emailMap[id] ?? id, total }))
      .sort((a, b) => b.total - a.total);

    const pico_horas = Array.from({ length: 24 }, (_, h) => ({
      hora: h,
      total: horaMap[h] ?? 0,
    }));

    const tipos_mensagem = Object.entries(tipoMap)
      .map(([tipo, total]) => ({ tipo, total }))
      .sort((a, b) => b.total - a.total);

    res.json({
      hoje: hoje ?? 0,
      mes: mes ?? 0,
      limite_mes: wsResult.data?.limite_mensagens_mes ?? 30,
      ranking_vendedoras,
      pico_horas,
      tipos_mensagem,
      media_avaliacoes,
    });
  } catch (err) {
    next(err);
  }
});

// ── Histórico de mensagens paginado ──────────────────────────────────────────

router.get("/cliente/mensagens", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    if (!workspaceId) {
      res.status(400).json({ error: "Workspace não encontrado para este usuário" });
      return;
    }

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabase
      .from("mensagens")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Enriquece com e-mail do usuário
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const emailMap = Object.fromEntries(
      (authUsers?.users ?? []).map((u) => [u.id, u.email ?? u.id])
    );

    const mensagens = (data ?? []).map((m) => ({
      ...m,
      usuario_email: emailMap[m.usuario_id] ?? m.usuario_id,
    }));

    res.json({ mensagens, total: count ?? 0, page, limit });
  } catch (err) {
    next(err);
  }
});

// ── Workspace do cliente (onboarding) ────────────────────────────────────────

router.get("/cliente/workspace", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    if (!workspaceId) { res.status(400).json({ error: "Sem workspace" }); return; }

    const { data, error } = await supabase
      .from("workspaces")
      .select("id, nome, segmento, contexto_marca, cnpj, email_contato, telefone, responsavel, cidade, estado")
      .eq("id", workspaceId)
      .single();

    if (error || !data) { res.status(404).json({ error: "Workspace não encontrado" }); return; }
    res.json({ workspace: data });
  } catch (err) { next(err); }
});

const onboardingSchema = z.object({
  nome:          z.string().min(1).max(100).optional(),
  segmento:      z.string().min(1).max(100).optional(),
  cnpj:          z.string().max(20).optional().nullable(),
  email_contato: z.string().email().or(z.literal("")).optional().nullable(),
  telefone:      z.string().max(20).optional().nullable(),
  responsavel:   z.string().max(150).optional().nullable(),
  cidade:        z.string().max(100).optional().nullable(),
  estado:        z.string().max(2).optional().nullable(),
  contexto_marca: z.string().min(10).optional(),
});

router.patch("/cliente/workspace", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    if (!workspaceId) { res.status(400).json({ error: "Sem workspace" }); return; }

    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return; }

    const { data, error } = await supabase
      .from("workspaces")
      .update(parsed.data)
      .eq("id", workspaceId)
      .select()
      .single();

    if (error || !data) { res.status(500).json({ error: "Erro ao salvar workspace" }); return; }
    res.json({ workspace: data });
  } catch (err) { next(err); }
});

// ── Financeiro: status + uso do mês ──────────────────────────────────────────

router.get("/cliente/financeiro", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    if (!workspaceId) { res.status(400).json({ error: "Sem workspace" }); return; }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [wsResult, { count: mensagensMes }] = await Promise.all([
      supabase
        .from("workspaces")
        .select("id, status, trial_expira_em, limite_mensagens_mes, creditos_extras, asaas_subscription_id, asaas_customer_id")
        .eq("id", workspaceId)
        .single(),
      supabase
        .from("mensagens")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("created_at", startOfMonth.toISOString()),
    ]);

    if (wsResult.error || !wsResult.data) { res.status(404).json({ error: "Workspace não encontrado" }); return; }

    res.json({
      status:                wsResult.data.status,
      trial_expira_em:       wsResult.data.trial_expira_em,
      limite_mensagens_mes:  wsResult.data.limite_mensagens_mes,
      creditos_extras:       wsResult.data.creditos_extras ?? 0,
      asaas_subscription_id: wsResult.data.asaas_subscription_id,
      asaas_customer_id:     wsResult.data.asaas_customer_id,
      mensagens_mes:         mensagensMes ?? 0,
    });
  } catch (err) { next(err); }
});

// ── Financeiro: histórico de pagamentos ──────────────────────────────────────

router.get("/cliente/pagamentos", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    if (!workspaceId) { res.status(400).json({ error: "Sem workspace" }); return; }

    const { data: ws, error } = await supabase
      .from("workspaces")
      .select("asaas_customer_id, asaas_subscription_id")
      .eq("id", workspaceId)
      .single();

    if (error || !ws) { res.status(404).json({ error: "Workspace não encontrado" }); return; }
    if (!ws.asaas_customer_id) { res.json({ pagamentos: [] }); return; }

    try {
      const data = await asaasService.listarPagamentosCliente(ws.asaas_customer_id);
      res.json({ pagamentos: data.data ?? [] });
    } catch {
      res.json({ pagamentos: [] });
    }
  } catch (err) { next(err); }
});

// ── Financeiro: comprar créditos extras (cobrança avulsa PIX) ─────────────────

const comprarCreditosSchema = z.object({
  pacotes: z.coerce.number().int().min(1).max(10),
});

router.post("/cliente/comprar-creditos", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.user!.workspace_id;
    if (!workspaceId) { res.status(400).json({ error: "Sem workspace" }); return; }

    const parsed = comprarCreditosSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return; }

    const { pacotes } = parsed.data;

    const { data: ws, error } = await supabase
      .from("workspaces")
      .select("nome, asaas_customer_id")
      .eq("id", workspaceId)
      .single();

    if (error || !ws) { res.status(404).json({ error: "Workspace não encontrado" }); return; }
    if (!ws.asaas_customer_id) {
      res.status(400).json({ error: "Dados de cobrança não configurados. Complete o onboarding com CNPJ e e-mail." });
      return;
    }

    // Preço: 1º pacote R$9,90 + demais R$8,91 cada
    const valor = parseFloat((9.90 + Math.max(0, pacotes - 1) * 8.91).toFixed(2));
    const creditos = pacotes * 30;
    const descricao = `${creditos} créditos extras — ${ws.nome}`;

    const cobranca = await asaasService.criarCobrancaAvulsa(ws.asaas_customer_id, valor, descricao);
    const pix      = await asaasService.gerarSegundaVia(cobranca.id);

    res.json({
      pagamento_id:   cobranca.id,
      valor,
      creditos,
      pix_copia_cola: pix.payload ?? null,
      pix_qrcode_url: pix.encodedImage ?? null,
    });
  } catch (err) { next(err); }
});

export default router;
