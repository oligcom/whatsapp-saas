import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();

const ratingSchema = z.object({
  avaliacao: z.coerce.number().int().min(1).max(5),
});

// POST /mensagens/:id/avaliar — salva avaliação (1-5) de uma mensagem
router.post(
  "/mensagens/:id/avaliar",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mensagemId = String(req.params.id);
      const workspaceId = req.user!.workspace_id;

      const parsed = ratingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten().fieldErrors });
        return;
      }

      // Garante que a mensagem pertence ao workspace do solicitante
      const { error } = await supabase
        .from("mensagens")
        .update({ avaliacao: parsed.data.avaliacao })
        .eq("id", mensagemId)
        .eq("workspace_id", workspaceId ?? "");

      if (error) {
        res.status(500).json({ error: "Erro ao salvar avaliação" });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
