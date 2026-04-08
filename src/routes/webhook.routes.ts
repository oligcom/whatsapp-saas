import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";

const router = Router();

router.post("/asaas", async (req: Request, res: Response) => {
  try {
    const evento = req.body;
    const subscriptionId = evento.payment?.subscription || evento.subscription?.id;

    if (!subscriptionId) {
      res.status(200).json({ ok: true });
      return;
    }

    let novoStatus: string | null = null;

    switch (evento.event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED":
        novoStatus = "active";
        break;
      case "PAYMENT_OVERDUE":
        novoStatus = "suspended";
        break;
      case "SUBSCRIPTION_DELETED":
      case "PAYMENT_DELETED":
        novoStatus = "suspended";
        break;
    }

    if (novoStatus) {
      await supabase
        .from("workspaces")
        .update({ status: novoStatus })
        .eq("asaas_subscription_id", subscriptionId);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Erro no webhook Asaas:", error);
    res.status(200).json({ ok: true });
  }
});

export default router;
