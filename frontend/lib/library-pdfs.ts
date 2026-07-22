import { dbList, dbSet, dbUpdate } from "./db";

export type LibraryPdfKey = "books.json" | "materials.json";

type LibraryPdfRecord = {
  id: string;
  library_key: LibraryPdfKey;
  pdf_b64: string;
  pdf_nome: string;
  pdf_mime: string;
  created_at?: string;
  updated_at: string;
};

function text(value: unknown) {
  return String(value || "").trim();
}

export function libraryPdfKey(tipo: unknown): LibraryPdfKey {
  const value = text(tipo).toLowerCase();
  return value.includes("mater") || value.includes("apostila") ? "materials.json" : "books.json";
}

export function libraryPdfUrl(key: LibraryPdfKey, id: string) {
  const tipo = key === "materials.json" ? "materiais" : "livros";
  return `/api/biblioteca/pdf?tipo=${tipo}&id=${encodeURIComponent(id)}`;
}

export async function saveLibraryPdf(key: LibraryPdfKey, id: string, buffer: Buffer, filename: string, mime = "application/pdf") {
  if (!id) throw new Error("ID do arquivo obrigatorio.");
  if (!buffer.length) throw new Error("PDF vazio.");

  const files = await dbList<LibraryPdfRecord>("library_files.json");
  const existing = files.find((file) => file.library_key === key && file.id === id);
  const now = new Date().toISOString();
  const file: LibraryPdfRecord = {
    id,
    library_key: key,
    pdf_b64: buffer.toString("base64"),
    pdf_nome: text(filename) || `${id}.pdf`,
    pdf_mime: text(mime) || "application/pdf",
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  const next = existing
    ? files.map((row) => row === existing ? file : row)
    : [...files, file];
  await dbSet("library_files.json", next);

  return {
    url: libraryPdfUrl(key, id),
    pdf_nome: file.pdf_nome,
    pdf_mime: file.pdf_mime,
  };
}

export async function getLibraryPdf(key: LibraryPdfKey, id: string) {
  const files = await dbList<LibraryPdfRecord>("library_files.json");
  return files.find((file) => file.library_key === key && file.id === id) || null;
}

export async function deleteLibraryPdf(key: LibraryPdfKey, id: string) {
  await dbUpdate<LibraryPdfRecord[]>("library_files.json", (files) =>
    (Array.isArray(files) ? files : []).filter((file) => file.library_key !== key || file.id !== id),
    []
  );
}
