import { polishPortugueseText } from "./portuguese-text";

function text(value: unknown) {
  return String(value || "").trim();
}

function normalize(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function money(value: unknown) {
  const n = Number.parseFloat(text(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function financeCategory(row: Record<string, unknown>) {
  const raw = normalize(row.tipo_lancamento_detalhe || row.categoria || row.descricao || row.boleto_status);
  if (raw.includes("matric")) return "matricula";
  if (raw.includes("mensal")) return "mensalidade";
  if (raw.includes("material") || raw.includes("livro") || raw.includes("apostila")) return "material";
  if (raw.includes("reneg") || raw.includes("acordo")) return "renegociacao";
  if (raw.includes("avulsa") || raw.includes("avulso")) return "aula_avulsa";
  if (raw.includes("repos")) return "reposicao";
  if (raw.includes("evento")) return "evento";
  if (raw.includes("boleto")) return "boleto";
  return "outros";
}

function categoryTitle(category: string) {
  const titles: Record<string, string> = {
    matricula: "Matrícula",
    mensalidade: "Mensalidade",
    material: "Material didático",
    renegociacao: "Renegociação financeira",
    aula_avulsa: "Aula avulsa",
    reposicao: "Reposição de aula",
    evento: "Evento",
    boleto: "Boleto importado",
    outros: "Lançamento financeiro",
  };
  return titles[category] || titles.outros;
}

function introFor(category: string) {
  const intros: Record<string, string> = {
    matricula: "Informamos que a cobrança de matrícula foi lançada no sistema.",
    mensalidade: "Informamos que a mensalidade foi lançada no sistema.",
    material: "Informamos que a cobrança de material didático foi lançada no sistema.",
    renegociacao: "Informamos que a renegociação financeira foi registrada no sistema.",
    aula_avulsa: "Informamos que a cobrança referente à aula avulsa foi lançada no sistema.",
    reposicao: "Informamos que a cobrança referente à reposição de aula foi lançada no sistema.",
    evento: "Informamos que a cobrança referente ao evento foi lançada no sistema.",
    boleto: "Informamos que o boleto/fatura foi anexado e está disponível para pagamento.",
    outros: "Informamos que um lançamento financeiro foi registrado no sistema.",
  };
  return intros[category] || intros.outros;
}

export function financeMessage(row: Record<string, unknown>, origin = "") {
  const id = text(row.id);
  const pdfUrl = text(row.boleto_pdf_url || row.boleto_pdf_public_url);
  const boletoUrl = text(row.mercado_pago_ticket_url || row.boleto_url);
  const digitableLine = text(row.digitable_line || row.boleto_linha_digitavel);
  const barcode = text(row.boleto_codigo);
  const link = boletoUrl && boletoUrl.startsWith("http")
    ? boletoUrl
    : id
      ? `${origin}/api/financeiro/boleto?id=${encodeURIComponent(id)}`
      : pdfUrl
      ? (pdfUrl.startsWith("http") ? pdfUrl : `${origin}${pdfUrl}`)
      : origin;
  const category = financeCategory(row);
  const title = categoryTitle(category);
  const aluno = text(row.aluno || row.nome || "Aluno");
  const referencia = text(row.descricao || title);
  const parcela = text(row.parcela);
  const vencimento = text(row.vencimento || row.data_vencimento);
  const status = text(row.status || row.situacao);
  const subject = `${title} Active Educacional - ${referencia || aluno}`;
  const lines = [
    `Olá, ${aluno}!`,
    "",
    introFor(category),
    "",
    `Referência: ${referencia}`,
    parcela ? `Parcela: ${parcela}` : "",
    `Valor: ${money(row.valor_parcela || row.valor || row.valor_total)}`,
    vencimento ? `Vencimento: ${vencimento}` : "",
    status ? `Status: ${status}` : "",
    digitableLine ? "Linha digitável:" : "",
    digitableLine,
    !digitableLine && barcode ? `Código de barras: ${barcode}` : "",
    "",
    link ? `Acesse aqui: ${link}` : "",
    "",
    "Em caso de dúvida, fale com a secretaria da Active Educacional.",
  ].filter((line) => line !== "");

  return { subject: polishPortugueseText(subject), body: polishPortugueseText(lines.join("\n")) };
}
