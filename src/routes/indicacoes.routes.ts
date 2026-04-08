import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();

// ─── PÚBLICO ─────────────────────────────────────────────────────────────────

// GET /indicacao/:codigo — dados públicos do workspace indicante (para a landing page)
router.get(
  "/indicacao/:codigo",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const codigo = String(req.params.codigo).toUpperCase().trim();

      const { data: ws } = await supabase
        .from("workspaces")
        .select("nome, segmento")
        .eq("codigo_indicacao", codigo)
        .maybeSingle();

      if (!ws) {
        res.status(404).json({ error: "Código de indicação inválido" });
        return;
      }

      res.json({ nome: ws.nome, segmento: ws.segmento });
    } catch (err) {
      next(err);
    }
  }
);

// POST /indicacao/solicitar — submete solicitação de cadastro via indicação
const solicitacaoSchema = z.object({
  codigo_indicante: z.string().min(1).max(20).transform((s) => s.toUpperCase().trim()),
  nome_loja:        z.string().min(2).max(100),
  cnpj:             z.string().min(11).max(18),
  email:            z.string().email("Email inválido"),
  telefone:         z.string().min(8).max(20).optional(),
});

router.post(
  "/indicacao/solicitar",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = solicitacaoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten().fieldErrors });
        return;
      }

      const { codigo_indicante, ...dadosLoja } = parsed.data;

      const { data: ws } = await supabase
        .from("workspaces")
        .select("id")
        .eq("codigo_indicacao", codigo_indicante)
        .maybeSingle();

      if (!ws) {
        res.status(404).json({ error: "Código de indicação inválido" });
        return;
      }

      // Evita duplicata: mesmo email com solicitação pendente
      const { data: existente } = await supabase
        .from("solicitacoes_indicacao")
        .select("id")
        .eq("email", dadosLoja.email)
        .eq("status", "pendente")
        .maybeSingle();

      if (existente) {
        res.status(409).json({ error: "Já existe uma solicitação pendente para este email." });
        return;
      }

      const { data, error } = await supabase
        .from("solicitacoes_indicacao")
        .insert({ workspace_indicante_id: ws.id, ...dadosLoja })
        .select("id")
        .single();

      if (error) {
        res.status(500).json({ error: "Erro ao registrar solicitação" });
        return;
      }

      res.status(201).json({ ok: true, id: data.id });
    } catch (err) {
      next(err);
    }
  }
);

// ─── CLIENTE ─────────────────────────────────────────────────────────────────

// GET /cliente/indicacao — código e estatísticas de indicação do workspace
router.get(
  "/cliente/indicacao",
  requireAuth,
  requireRole("cliente"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.user!.workspace_id;
      if (!workspaceId) {
        res.status(400).json({ error: "Workspace não encontrado" });
        return;
      }

      const [wsResult, aprovadas, pendentes] = await Promise.all([
        supabase
          .from("workspaces")
          .select("codigo_indicacao")
          .eq("id", workspaceId)
          .single(),
        supabase
          .from("solicitacoes_indicacao")
          .select("*", { count: "exact", head: true })
          .eq("workspace_indicante_id", workspaceId)
          .eq("status", "aprovado"),
        supabase
          .from("solicitacoes_indicacao")
          .select("*", { count: "exact", head: true })
          .eq("workspace_indicante_id", workspaceId)
          .eq("status", "pendente"),
      ]);

      res.json({
        codigo_indicacao:  wsResult.data?.codigo_indicacao ?? null,
        total_aprovadas:   aprovadas.count ?? 0,
        total_pendentes:   pendentes.count ?? 0,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── ADMIN ───────────────────────────────────────────────────────────────────

const adminGuard = [requireAuth, requireRole("gestor")] as const;

// GET /admin/solicitacoes — lista todas as solicitações
router.get(
  "/admin/solicitacoes",
  ...adminGuard,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { data, error } = await supabase
        .from("solicitacoes_indicacao")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: "Erro ao listar solicitações" });
        return;
      }

      res.json({ solicitacoes: data ?? [] });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /admin/solicitacoes/:id/aprovar — aprova e cria workspace
router.patch(
  "/admin/solicitacoes/:id/aprovar",
  ...adminGuard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const solId = String(req.params.id);

      const { data: sol } = await supabase
        .from("solicitacoes_indicacao")
        .select("*")
        .eq("id", solId)
        .eq("status", "pendente")
        .maybeSingle();

      if (!sol) {
        res.status(404).json({ error: "Solicitação não encontrada ou já processada" });
        return;
      }

      // Gera código de indicação para o novo workspace
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let codigoNovo = "";
      for (let i = 0; i < 8; i++) codigoNovo += chars[Math.floor(Math.random() * chars.length)];

      const trialExpira = new Date();
      trialExpira.setDate(trialExpira.getDate() + 7);

      // Cria o workspace para a loja indicada
      const { data: novoWs, error: wsErr } = await supabase
        .from("workspaces")
        .insert({
          nome:                 sol.nome_loja,
          segmento:             "A definir",
          contexto_marca:       "A ser configurado pelo gestor.",
          status:               "trial",
          trial_expira_em:      trialExpira.toISOString(),
          limite_mensagens_mes: 50,
          codigo_indicacao:     codigoNovo,
        })
        .select("id")
        .single();

      if (wsErr || !novoWs) {
        res.status(500).json({ error: "Erro ao criar workspace: " + wsErr?.message });
        return;
      }

      // Credita +50 mensagens ao workspace indicante (se ainda existir)
      const { data: wsIndicante } = await supabase
        .from("workspaces")
        .select("limite_mensagens_mes")
        .eq("id", sol.workspace_indicante_id)
        .maybeSingle();

      if (wsIndicante) {
        await supabase
          .from("workspaces")
          .update({
            limite_mensagens_mes: wsIndicante.limite_mensagens_mes + 50,
          })
          .eq("id", sol.workspace_indicante_id);
      }

      // Atualiza solicitação como aprovada
      await supabase
        .from("solicitacoes_indicacao")
        .update({
          status:               "aprovado",
          workspace_criado_id:  novoWs.id,
          updated_at:           new Date().toISOString(),
        })
        .eq("id", solId);

      res.json({ ok: true, workspace_id: novoWs.id });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /admin/solicitacoes/:id/rejeitar — rejeita com motivo
const rejeitarSchema = z.object({
  motivo: z.string().min(3, "Motivo deve ter pelo menos 3 caracteres").max(500),
});

router.patch(
  "/admin/solicitacoes/:id/rejeitar",
  ...adminGuard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const solId = String(req.params.id);

      const parsed = rejeitarSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten().fieldErrors });
        return;
      }

      const { data: sol } = await supabase
        .from("solicitacoes_indicacao")
        .select("status")
        .eq("id", solId)
        .maybeSingle();

      if (!sol || sol.status !== "pendente") {
        res.status(404).json({ error: "Solicitação não encontrada ou já processada" });
        return;
      }

      await supabase
        .from("solicitacoes_indicacao")
        .update({
          status:           "rejeitado",
          motivo_rejeicao:  parsed.data.motivo,
          updated_at:       new Date().toISOString(),
        })
        .eq("id", solId);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
