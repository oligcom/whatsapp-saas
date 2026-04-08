import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { gerarMensagem } from "../services/ai/claude.service";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { supabase } from "../config/supabase";

const router = Router();

const bodySchema = z.object({
  nomeCliente:   z.string().min(1),
  produto:       z.string().min(1),
  contexto:      z.string().min(1),
  tom:           z.enum(["formal", "casual", "amigavel"]).default("amigavel"),
  tipo_mensagem: z.enum(["geral", "pos_compra", "reativacao", "promocao", "aniversario", "novidade", "cobranca"]).default("geral"),
  telefone:      z.string().optional().nullable(),
});

router.post(
  "/gerar-mensagem",
  requireAuth,
  requireRole("vendedora", "gestor", "cliente"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten().fieldErrors });
        return;
      }

      // Inject brand context + enforce trial expiry + enforce monthly limit
      let contextoDaMarca: string | undefined;
      if (req.user!.workspace_id) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("contexto_marca, limite_mensagens_mes, status, trial_expira_em")
          .eq("id", req.user!.workspace_id)
          .single();

        contextoDaMarca = ws?.contexto_marca ?? undefined;

        // Bloqueia se o período de acesso expirou
        if (ws?.trial_expira_em) {
          const expira = new Date(ws.trial_expira_em);
          if (expira < new Date()) {
            res.status(403).json({
              error: "Período de acesso expirado. Insira um cupom no painel para continuar.",
              code: "ACCESS_EXPIRED",
            });
            return;
          }
        }

        const limite = ws?.limite_mensagens_mes ?? 30;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count } = await supabase
          .from("mensagens")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", req.user!.workspace_id)
          .gte("created_at", startOfMonth.toISOString());

        if ((count ?? 0) >= limite) {
          res.status(429).json({
            error: `Limite mensal de ${limite} mensagens atingido. Aguarde o próximo mês ou peça ao gestor para aumentar o limite.`,
          });
          return;
        }
      }

      const mensagem = await gerarMensagem({ ...parsed.data, contextoDaMarca });

      // Persiste a mensagem gerada (aguarda para capturar o ID para avaliação)
      let mensagemId: string | null = null;
      if (req.user!.workspace_id) {
        const { data: saved, error } = await supabase
          .from("mensagens")
          .insert({
            workspace_id:  req.user!.workspace_id,
            usuario_id:    req.user!.id,
            nome_cliente:  parsed.data.nomeCliente,
            telefone:      parsed.data.telefone ?? null,
            mensagem,
            tipo_mensagem: parsed.data.tipo_mensagem,
            tom:           parsed.data.tom,
          })
          .select("id")
          .single();
        if (error) console.error("[mensagens] Erro ao salvar:", error.message);
        mensagemId = saved?.id ?? null;
      }

      res.json({ mensagem, mensagem_id: mensagemId });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
