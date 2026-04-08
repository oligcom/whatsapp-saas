import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import multer from "multer";
import { supabase } from "../config/supabase";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import {
  extrairDePDF,
  extrairDeURL,
} from "../services/context/extractor.service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const guard = [requireAuth, requireRole("gestor")] as const;

// ── Schema ───────────────────────────────────────────────────────────────────

const workspaceSchema = z.object({
  nome: z.string().min(1).max(100),
  segmento: z.string().min(1).max(100),
  contexto_marca: z.string().min(1),
  logo_url: z.string().url().or(z.literal("")).optional(),
  limite_mensagens_mes: z.coerce.number().int().min(1).max(100_000).default(30),
});

// ── CRUD ─────────────────────────────────────────────────────────────────────

router.get("/admin/workspaces", ...guard, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) { res.status(500).json({ error: "Erro ao listar workspaces" }); return; }
    res.json({ workspaces: data });
  } catch (err) { next(err); }
});

router.post("/admin/workspaces", ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = workspaceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return; }

    const trialExpira = new Date();
    trialExpira.setDate(trialExpira.getDate() + 7);

    const { data, error } = await supabase
      .from("workspaces")
      .insert({
        ...parsed.data,
        status: "trial",
        trial_expira_em: trialExpira.toISOString(),
      })
      .select()
      .single();

    if (error) { res.status(500).json({ error: "Erro ao criar workspace" }); return; }
    res.status(201).json({ workspace: data });
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
