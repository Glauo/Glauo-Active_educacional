import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList } from "@/lib/db";
import { getLibraryPdf, libraryPdfKey, libraryPdfUrl } from "@/lib/library-pdfs";
import { studentCanAccessLibraryItem } from "@/lib/library-access";
import { getSchoolClasses } from "@/lib/school-data";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  const id = text(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "ID do PDF obrigatorio." }, { status: 400 });

  const key = libraryPdfKey(req.nextUrl.searchParams.get("tipo") || "livros");
  const items = await dbList<Row>(key);
  const item = items.find((row) => text(row.id) === id);
  if (!item) return NextResponse.json({ error: "Material nao encontrado." }, { status: 404 });

  if (text(session.perfil).toLowerCase().includes("aluno")) {
    const [students, classes] = await Promise.all([dbList<Row>("students.json"), getSchoolClasses()]);
    const normalizedLogin = text(session.usuario).toLowerCase();
    const normalizedName = text(session.pessoa).toLowerCase();
    const student = students.find((row) =>
      text(row.login).toLowerCase() === normalizedLogin ||
      text(row.nome || row.name).toLowerCase() === normalizedName
    );
    if (!student || !studentCanAccessLibraryItem(item, session, student, classes)) {
      return NextResponse.json({ error: "Material nao liberado para o nivel deste aluno." }, { status: 403 });
    }
  }

  const file = await getLibraryPdf(key, id);
  if (file?.pdf_b64) {
    return new NextResponse(Buffer.from(file.pdf_b64, "base64"), {
      headers: {
        "Content-Type": text(file.pdf_mime) || "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(text(file.pdf_nome) || `${id}.pdf`)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const url = text(item?.url || item?.file_path);
  if (url && url !== libraryPdfUrl(key, id)) {
    return NextResponse.redirect(new URL(url, req.url));
  }

  return NextResponse.json({ error: "PDF nao encontrado em Material." }, { status: 404 });
}
