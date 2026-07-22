import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageSchoolContent, text, type HomeworkQuestion } from "@/lib/school-modules";
import { resolveBookContentTarget } from "@/lib/book-content-targeting";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageSchoolContent(session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const body = (await req.json()) as Record<string, unknown>;
  let target;
  try {
    target = await resolveBookContentTarget(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Destinatario invalido." }, { status: 400 });
  }
  const disciplina = text(body.disciplina || "Disciplina");
  const turma = target.turma || target.aluno;
  const capitulo = target.referencia;
  const dificuldade = text(body.dificuldade || "Medio");
  const count = Math.max(1, Math.min(15, Number(body.quantidade) || 5));
  const foco = text(body.foco || "fixacao do conteudo");

  const questions: HomeworkQuestion[] = Array.from({ length: count }).map((_, index) => {
    const n = index + 1;
    if (index % 3 === 0) {
      return {
        id: crypto.randomUUID(),
        tipo: "multipla_escolha",
        enunciado: `(${target.livro} - ${disciplina}) Sobre ${capitulo}, escolha a alternativa mais adequada para ${foco}. Questao ${n}.`,
        opcoes: [
          `Aplicacao correta do conteudo em ${turma}`,
          "Resposta parcialmente relacionada, mas incompleta",
          "Conceito fora do contexto estudado",
          "Alternativa com erro conceitual comum",
        ],
        pontos: 2,
        feedback: "Revise a questao antes de publicar. A correcao automatica sera feita pela Wiz IA.",
      };
    }
    if (index % 3 === 1) {
      return {
        id: crypto.randomUUID(),
        tipo: "verdadeiro_falso",
        enunciado: `No ${target.livro}, a afirmacao a seguir esta alinhada ao conteudo ${capitulo} em nivel ${dificuldade}: o aluno consegue explicar o conceito com exemplo proprio.`,
        pontos: 1,
        feedback: "Ajuste a afirmacao conforme o livro/apostila antes de publicar.",
      };
    }
    return {
      id: crypto.randomUUID(),
      tipo: "aberta",
      enunciado: `Explique, com suas palavras, como ${capitulo} aparece em uma situacao pratica. Mantenha a resposta coerente com ${disciplina}.`,
      pontos: 3,
      feedback: "Correcao manual recomendada com feedback individual.",
    };
  });

  return NextResponse.json({
    titulo: `Licao de Casa - ${target.livro}: ${capitulo}`,
    descricao: `Atividade gerada pela Prof Wiz para ${turma}, baseada no ${target.livro}. Revise todas as questoes antes de publicar.`,
    livro: target.livro,
    questions,
  });
}
