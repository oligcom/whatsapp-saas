import { anthropic, DEFAULT_MODEL } from "../../config/anthropic";

export interface MessageInput {
  nomeCliente: string;
  produto: string;
  contexto: string;
  tom?: "formal" | "casual" | "amigavel";
  contextoDaMarca?: string;
}

export async function gerarMensagem(input: MessageInput): Promise<string> {
  const { nomeCliente, produto, contexto, tom = "amigavel", contextoDaMarca } = input;

  const secaoMarca = contextoDaMarca
    ? `\nIdentidade e contexto da marca:\n${contextoDaMarca}\n`
    : "";

  const prompt = `Você é uma assistente de vendas.${secaoMarca}
Gere uma mensagem de WhatsApp curta e natural para enviar a um cliente.

Dados:
- Nome do cliente: ${nomeCliente}
- Produto/serviço: ${produto}
- Contexto: ${contexto}
- Tom: ${tom}

Regras:
- Máximo 3 parágrafos curtos
- Não use asteriscos nem markdown
- Termine com uma chamada para ação clara
- Escreva em português brasileiro
- Reflita a identidade da marca no texto, se fornecida`;

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Resposta inesperada da IA");
  return block.text;
}
