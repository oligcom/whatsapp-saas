import { Router, Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

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

export default router;
