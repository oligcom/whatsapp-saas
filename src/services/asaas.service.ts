import axios from "axios";
import { env } from "../config/env";

const asaasApi = axios.create({
  baseURL: env.ASAAS_BASE_URL,
  headers: {
    "access_token": env.ASAAS_API_KEY ?? "",
    "Content-Type": "application/json",
  },
});

function proximaDataCobranca(diasDeHoje: number): string {
  const data = new Date();
  data.setDate(data.getDate() + diasDeHoje);
  return data.toISOString().split("T")[0];
}

export const asaasService = {
  async criarOuBuscarCliente(dados: {
    name: string;
    cpfCnpj: string;
    email: string;
    phone?: string;
    city?: string;
    state?: string;
  }) {
    const cnpjLimpo = dados.cpfCnpj.replace(/\D/g, "");
    const busca = await asaasApi.get(`/customers?cpfCnpj=${cnpjLimpo}`);
    if (busca.data.data?.length > 0) {
      return busca.data.data[0];
    }
    const criacao = await asaasApi.post("/customers", {
      ...dados,
      cpfCnpj: cnpjLimpo,
    });
    return criacao.data;
  },

  async criarAssinatura(customerId: string, descricao: string) {
    const response = await asaasApi.post("/subscriptions", {
      customer: customerId,
      billingType: "PIX",
      value: 49.90,
      nextDueDate: proximaDataCobranca(7),
      cycle: "MONTHLY",
      description: descricao,
    });
    return response.data;
  },

  async cancelarAssinatura(subscriptionId: string) {
    const response = await asaasApi.delete(`/subscriptions/${subscriptionId}`);
    return response.data;
  },
};
