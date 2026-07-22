"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BOOK_LEVELS } from "@/lib/course-modules";

type LivroData = { id?: string; titulo?: string; title?: string; autor?: string; author?: string; nivel?: string; turma?: string; url?: string; pdf_nome?: string; [k: string]: unknown };
type VideoData = { id?: string; titulo?: string; title?: string; turma?: string; url?: string; descricao?: string; [k: string]: unknown };

function LivroModal({ livro, onClose, onSaved }: { livro?: LivroData; onClose: () => void; onSaved: () => void }) {
  const isEdit = Boolean(livro?.id);
  const [form, setForm] = useState({
    titulo: String(livro?.titulo || livro?.title || ""),
    autor: String(livro?.autor || livro?.author || ""),
    nivel: String(livro?.nivel || "Livro 1"),
    turma: String(livro?.turma || "Todas"),
    url: String(livro?.url || ""),
  });
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErro("");
  }

  async function excluir() {
    if (!confirm(`Excluir o livro "${livro?.titulo || livro?.title}"?`)) return;
    setSaving(true);
    setErro("");
    try {
      const res = await fetch(`/api/biblioteca?tipo=livros&id=${encodeURIComponent(String(livro!.id))}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro((data as { error?: string }).error || "Nao foi possivel excluir o livro.");
        return;
      }
      onSaved();
    } catch {
      setErro("Falha de conexao ao excluir o livro. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function salvar() {
    if (!form.titulo.trim()) {
      setErro("O titulo e obrigatorio.");
      return;
    }
    setSaving(true);
    const payload = new FormData();
    if (isEdit && livro?.id) payload.set("id", String(livro.id));
    Object.entries(form).forEach(([key, value]) => payload.set(key, value));
    if (arquivoPdf) payload.set("arquivo_pdf", arquivoPdf);
    const res = await fetch("/api/biblioteca?tipo=livros", { method: isEdit ? "PUT" : "POST", body: payload });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro((d as { error?: string }).error || "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? "Editar livro" : "Adicionar livro PDF"}</div>
            <div className="modal-subtitle">Livros de ingles: 1, 1.2, 2, 3, 3.2, 4, 5 e 6</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group form-group-span2">
              <label className="form-label">Titulo *</label>
              <input className="form-input" placeholder="Ex: Livro 1 - Student Book" value={form.titulo} onChange={(e) => update("titulo", e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Livro / nivel</label>
              <select className="form-input" value={form.nivel} onChange={(e) => update("nivel", e.target.value)}>
                {BOOK_LEVELS.map((level) => <option key={level}>{level}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Autor / editora</label>
              <input className="form-input" placeholder="Opcional" value={form.autor} onChange={(e) => update("autor", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Turma</label>
              <input className="form-input" placeholder="Todas ou nome da turma" value={form.turma} onChange={(e) => update("turma", e.target.value)} />
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Arquivo PDF do livro</label>
              <input className="form-input" type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivoPdf(e.target.files?.[0] || null)} />
              <span className="form-hint">{arquivoPdf ? arquivoPdf.name : livro?.pdf_nome ? `Atual: ${livro.pdf_nome}` : "Selecione o PDF do livro."}</span>
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Link externo do PDF</label>
              <input className="form-input" type="url" placeholder="https://..." value={form.url} onChange={(e) => update("url", e.target.value)} />
              <span className="form-hint">Opcional: use quando o PDF ja estiver no Drive ou em outro servidor.</span>
            </div>
          </div>
          {erro && <div className="form-error">{erro}</div>}
        </div>
        <div className="modal-footer">
          {isEdit && <button className="btn btn-danger btn-sm" onClick={excluir} disabled={saving} style={{ marginRight: "auto" }}>Excluir</button>}
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : isEdit ? "Salvar alteracoes" : "Adicionar PDF"}</button>
        </div>
      </div>
    </div>
  );
}

function SimpleModal({
  title,
  defaults,
  endpoint,
  onClose,
  onSaved,
}: {
  title: string;
  defaults: Record<string, string>;
  endpoint: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(defaults);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErro("");
  }
  async function salvar() {
    if (!form.titulo?.trim()) {
      setErro("O titulo e obrigatorio.");
      return;
    }
    setSaving(true);
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) {
      setErro("Erro ao salvar.");
      return;
    }
    onSaved();
  }
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group form-group-span2"><label className="form-label">Titulo *</label><input className="form-input" value={form.titulo || ""} onChange={(e) => update("titulo", e.target.value)} autoFocus /></div>
            {"url" in form && <div className="form-group form-group-span2"><label className="form-label">Link</label><input className="form-input" value={form.url || ""} onChange={(e) => update("url", e.target.value)} /></div>}
            {"turma" in form && <div className="form-group"><label className="form-label">Turma</label><input className="form-input" value={form.turma || ""} onChange={(e) => update("turma", e.target.value)} /></div>}
            {"tipo" in form && <div className="form-group"><label className="form-label">Tipo</label><input className="form-input" value={form.tipo || ""} onChange={(e) => update("tipo", e.target.value)} /></div>}
            {"descricao" in form && <div className="form-group form-group-span2"><label className="form-label">Descricao</label><textarea className="form-input form-textarea" rows={2} value={form.descricao || ""} onChange={(e) => update("descricao", e.target.value)} /></div>}
          </div>
          {erro && <div className="form-error">{erro}</div>}
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button><button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></div>
      </div>
    </div>
  );
}

export function AdicionarLivroBtn({ livro }: { livro?: LivroData } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(livro?.id);
  return (
    <>
      {isEdit ? <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setOpen(true)}>Editar</button> : <button className="btn btn-primary" onClick={() => setOpen(true)}>Adicionar livro PDF</button>}
      {open && <LivroModal livro={livro} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}

export function AdicionarVideoBtn() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>+ Video</button>
      {open && <SimpleModal title="Adicionar video / aula gravada" endpoint="/api/biblioteca?tipo=videos" defaults={{ titulo: "", url: "", turma: "", descricao: "" }} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}

export function AdicionarMaterialBtn() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>+ Material</button>
      {open && <SimpleModal title="Adicionar material / apostila" endpoint="/api/biblioteca?tipo=materiais" defaults={{ titulo: "", url: "", turma: "", tipo: "Apostila", descricao: "" }} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}

export type { LivroData, VideoData };
