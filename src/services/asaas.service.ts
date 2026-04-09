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
    mobilePhone?: string;
    city?: string;
    state?: string;
  }) {
    const cnpjLimpo = dados.cpfCnpj.replace(/\D/g, "");
    try {
      const busca = await asaasApi.get(`/customers?cpfCnpj=${cnpjLimpo}`);
      if (busca.data.data?.length > 0) {
        return busca.data.data[0];
      }
      const criacao = await asaasApi.post("/customers", {
        ...dados,
        cpfCnpj: cnpjLimpo,
      });
      return criacao.data;
    } catch (error: any) {
      console.error("[Asaas] criarOuBuscarCliente error:", error.response?.data);
      throw error;
    }
  },

  async criarAssinatura(customerId: string, descricao: string) {
    try {
      const response = await asaasApi.post("/subscriptions", {
        customer: customerId,
        billingType: "PIX",
        value: 49.90,
        nextDueDate: proximaDataCobranca(7),
        cycle: "MONTHLY",
        description: descricao,
      });
      return response.data;
    } catch (error: any) {
      console.error("[Asaas] criarAssinatura error:", error.response?.data);
      throw error;
    }
  },

  async cancelarAssinatura(subscriptionId: string) {
    const response = await asaasApi.delete(`/subscriptions/${subscriptionId}`);
    return response.data;
  },

  async buscarAssinatura(subscriptionId: string) {
    try {
      const response = await asaasApi.get(`/subscriptions/${subscriptionId}`);
      return response.data;
    } catch (error: any) {
      console.error("[Asaas] buscarAssinatura error:", error.response?.data);
      throw error;
    }
  },

  async listarCobrancas(subscriptionId: string) {
    try {
      const response = await asaasApi.get(`/payments?subscription=${subscriptionId}&limit=20`);
      return response.data;
    } catch (error: any) {
      console.error("[Asaas] listarCobrancas error:", error.response?.data);
      throw error;
    }
  },

  async gerarSegundaVia(paymentId: string) {
    try {
      const response = await asaasApi.get(`/payments/${paymentId}/pixQrCode`);
      return response.data;
    } catch (error: any) {
      console.error("[Asaas] gerarSegundaVia error:", error.response?.data);
      throw error;
    }
  },
};
