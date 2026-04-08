import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import path from "path";

import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import messagesRoutes from "./routes/messages.routes";
import adminRoutes from "./routes/admin.routes";
import workspacesRoutes from "./routes/workspaces.routes";
import clienteRoutes from "./routes/cliente.routes";
import equipeRoutes from "./routes/equipe.routes";
import cupomRoutes from "./routes/cupom.routes";
import avaliacoesRoutes from "./routes/avaliacoes.routes";
import indicacoesRoutes from "./routes/indicacoes.routes";
import healthRoutes from "./routes/health.routes";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "100kb" }));

app.use(express.static(path.join(__dirname, "../public")));

app.use("/", healthRoutes);
app.use("/", authRoutes);
app.use("/", messagesRoutes);
app.use("/", adminRoutes);
app.use("/", workspacesRoutes);
app.use("/", clienteRoutes);
app.use("/", equipeRoutes);
app.use("/", cupomRoutes);
app.use("/", avaliacoesRoutes);
app.use("/", indicacoesRoutes);

app.use((_req, res, next) => {
  // Prevent Express's default HTML 404 page on unmatched routes
  res.status(404).json({ error: "Rota não encontrada" });
});

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Servidor rodando em http://localhost:${env.PORT}`);
});
