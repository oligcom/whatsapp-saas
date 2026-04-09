import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import multer from "multer";
import { supabase } from "../config/supabase";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import {
  extrairDePDF,
  extrairDeURL,
} from "../services/context/extractor.service";
import { asaasService } from "../services/asaas.service";
import { env } from "../config/env";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const guard = [requireAuth, requireRole("gestor")] as const;

// ── Schema ───────────────────────────────────────────────────────────────────

const workspaceSchema = z.object({
  nome: z.string().min(1).max(100),
  segmento: z.string().min(1).max(100),
  contexto_marca: z.string().min(1),
  logo_url: z.string().max(5_000_000).refine(
    v => !v || v.startsWith("data:image/") || v.startsWith("http://") || v.startsWith("https://"),
    { message: "logo_url deve ser uma URL ou imagem em base64" }
  ).optional().nullable(),
  limite_mensagens_mes: z.coerce.number().int().min(1).max(100_000).default(30),
  cnpj:          z.string().max(20).optional().nullable(),
  email_contato: z.string().email().or(z.literal("")).optional().nullable(),
  telefone:      z.string().max(20).optional().nullable(),
  responsavel:   z.string().max(150).optional().nullable(),
  cidade:        z.string().max(100).optional().nullable(),
  estado:        z.string().max(2).optional().nullable(),
});

// ── CRUD ─────────────────────────────────────────────────────────────────────

router.get("/admin/workspaces", ...guard, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [wsResult, avgResult] = await Promise.all([
      supabase.from("workspaces").select("*").order("created_at", { ascending: false }),
      supabase.from("mensagens").select("workspace_id, avaliacao").not("avaliacao", "is", null),
    ]);

    if (wsResult.error) { res.status(500).json({ error: "Erro ao listar workspaces" }); return; }

    // Calcula média de avaliações por workspace
    const avgMap: Record<string, { sum: number; count: number }> = {};
    for (const m of avgResult.data ?? []) {
      if (!avgMap[m.workspace_id]) avgMap[m.workspace_id] = { sum: 0, count: 0 };
      avgMap[m.workspace_id].sum   += (m.avaliacao as number);
      avgMap[m.workspace_id].count += 1;
    }

    const workspaces = (wsResult.data ?? []).map((ws) => ({
      ...ws,
      media_avaliacoes: avgMap[ws.id]
        ? Math.round((avgMap[ws.id].sum / avgMap[ws.id].count) * 10) / 10
        : null,
    }));

    res.json({ workspaces });
  } catch (err) { next(err); }
});

router.post("/admin/workspaces", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = workspaceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return; }

    const trialExpira = new Date();
    trialExpira.setDate(trialExpira.getDate() + 7);

    // Gera código de indicação único
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let codigoIndicacao = "";
    for (let i = 0; i < 8; i++) codigoIndicacao += chars[Math.floor(Math.random() * chars.length)];

    const { data, error } = await supabase
      .from("workspaces")
      .insert({
        ...parsed.data,
        status: "trial",
        trial_expira_em: trialExpira.toISOString(),
        codigo_indicacao: codigoIndicacao,
      })
      .select()
      .single();

    if (error) { res.status(500).json({ error: "Erro ao criar workspace" }); return; }

    // Integração Asaas: cadastra cliente se API key configurada e cnpj + email presentes
    // A assinatura NÃO é criada automaticamente — só via liberar-cobranca ou cliente/assinar
    if (env.ASAAS_API_KEY && parsed.data.cnpj && parsed.data.email_contato) {
      try {
        const cliente = await asaasService.criarOuBuscarCliente({
          name:        parsed.data.nome,
          cpfCnpj:     parsed.data.cnpj,
          email:       parsed.data.email_contato,
          mobilePhone: parsed.data.telefone ?? undefined,
          city:        parsed.data.cidade   ?? undefined,
          state:       parsed.data.estado   ?? undefined,
        });

        const { data: updated } = await supabase
          .from("workspaces")
          .update({ asaas_customer_id: cliente.id })
          .eq("id", data.id)
          .select()
          .single();

        if (updated) {
          res.status(201).json({ workspace: updated });
          return;
        }
      } catch (asaasErr: unknown) {
        // Não faz rollback: workspace salvo mesmo sem cliente Asaas
        const msg = asaasErr instanceof Error ? asaasErr.message : "Erro desconhecido";
        console.error(`[Asaas] Erro ao criar cliente para workspace ${data.id}: ${msg}`);
      }
    }

    res.status(201).json({ workspace: data });
  } catch (err) { next(err); }
});

// ── Liberar cobrança Asaas (gestor) ──────────────────────────────────────────

router.post("/admin/workspaces/:id/liberar-cobranca", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, nome, asaas_customer_id, asaas_subscription_id")
      .eq("id", req.params.id)
      .single();

    if (wsErr || !ws) { res.status(404).json({ error: "Workspace não encontrado" }); return; }
    if (!ws.asaas_customer_id) { res.status(400).json({ error: "Workspace sem cliente no Asaas. Verifique se CNPJ e e-mail foram preenchidos." }); return; }
    if (ws.asaas_subscription_id) { res.status(400).json({ error: "Workspace já possui assinatura ativa." }); return; }

    const assinatura = await asaasService.criarAssinatura(
      ws.asaas_customer_id,
      `Plano Gerador - ${ws.nome}`
    );

    const { data: updated, error: updateErr } = await supabase
      .from("workspaces")
      .update({ asaas_subscription_id: assinatura.id, asaas_cobranca_liberada: true })
      .eq("id", req.params.id)
      .select()
      .single();

    if (updateErr || !updated) { res.status(500).json({ error: "Erro ao atualizar workspace" }); return; }
    res.json({ workspace: updated });
  } catch (err) { next(err); }
});

// ── Marcar workspace como Demo ────────────────────────────────────────────────

router.patch("/admin/workspaces/:id/demo", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const demoExpira = new Date();
    demoExpira.setDate(demoExpira.getDate() + 30);

    const { data, error } = await supabase
      .from("workspaces")
      .update({
        status: "demo",
        trial_expira_em: demoExpira.toISOString(),
        limite_mensagens_mes: 100,
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) { res.status(404).json({ error: "Workspace não encontrado" }); return; }
    res.json({ workspace: data });
  } catch (err) { next(err); }
});

router.put("/admin/workspaces/:id", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = workspaceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return; }

    const { data, error } = await supabase
      .from("workspaces")
      .update(parsed.data)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) { res.status(404).json({ error: "Workspace não encontrado" }); return; }
    res.json({ workspace: data });
  } catch (err) { next(err); }
});

// ── Context extraction ────────────────────────────────────────────────────────

// POST /admin/contexto/extrair-pdf  (multipart, field: "arquivo")
router.post(
  "/admin/contexto/extrair-pdf",
  ...guard,
  upload.single("arquivo"),
  async (req: Request, res: Response) => {
    if (!req.file) { res.status(400).json({ error: "Nenhum arquivo enviado" }); return; }
    if (req.file.mimetype !== "application/pdf") {
      res.status(400).json({ error: "Arquivo deve ser um PDF" });
      return;
    }
    try {
      const texto = await extrairDePDF(req.file.buffer);
      res.json({ texto });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao processar PDF";
      res.status(422).json({ error: msg });
    }
  }
);

// POST /admin/contexto/extrair-url  { url }
router.post(
  "/admin/contexto/extrair-url",
  ...guard,
  async (req: Request, res: Response) => {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "url obrigatória" });
      return;
    }
    try {
      const texto = await extrairDeURL(url);
      res.json({ texto });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao acessar URL";
      res.status(422).json({ error: msg });
    }
  }
);

// ── Members ───────────────────────────────────────────────────────────────────

router.get(
  "/admin/workspaces/:id/membros",
  ...guard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("user_id, created_at")
        .eq("workspace_id", req.params.id);

      if (error) { res.status(500).json({ error: "Erro ao listar membros" }); return; }
      res.json({ membros: data });
    } catch (err) { next(err); }
  }
);

export default router;
