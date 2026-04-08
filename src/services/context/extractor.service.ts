// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  buf: Buffer
) => Promise<{ text: string }>;

export async function extrairDePDF(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  const text = result.text.replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("PDF não contém texto extraível");
  return text;
}

export async function extrairDeURL(rawUrl: string): Promise<string> {
  const url = resolveExportUrl(rawUrl.trim());
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Não foi possível acessar a URL (HTTP ${res.status})`);
  }
  const body = await res.text();
  return limparTexto(body);
}

// ── URL resolvers ────────────────────────────────────────────────────────────

function resolveExportUrl(url: string): string {
  // Google Docs: https://docs.google.com/document/d/<ID>/edit
  const docsMatch = url.match(/docs\.google\.com\/document\/d\/([^/?#]+)/);
  if (docsMatch) {
    return `https://docs.google.com/document/d/${docsMatch[1]}/export?format=txt`;
  }

  // Google Drive file: https://drive.google.com/file/d/<ID>/view
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (driveMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }

  // Google Drive open: https://drive.google.com/open?id=<ID>
  const driveOpen = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (driveOpen) {
    return `https://drive.google.com/uc?export=download&id=${driveOpen[1]}`;
  }

  return url;
}

function limparTexto(raw: string): string {
  const text = raw.trimStart();
  if (text.startsWith("<")) {
    // Strip HTML tags, decode common entities
    return text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s{2,}/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
