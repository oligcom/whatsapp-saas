import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { supabase, supabaseAnon } from "../config/supabase";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/auth/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { email, password } = parsed.data;
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      res.status(401).json({ error: "Email ou senha incorretos" });
      return;
    }

    const role = (data.user.app_metadata?.role as string) ?? "vendedora";

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      email: data.user.email,
      role,
    });
  } catch (err) { next(err); }
});

router.post("/auth/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ error: "refresh_token obrigatório" });
      return;
    }

    const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token });

    if (error || !data.session) {
      res.status(401).json({ error: "Sessão expirada, faça login novamente" });
      return;
    }

    const role = (data.user?.app_metadata?.role as string) ?? "vendedora";

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      email: data.user?.email,
      role,
    });
  } catch (err) { next(err); }
});

router.post("/auth/logout", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
