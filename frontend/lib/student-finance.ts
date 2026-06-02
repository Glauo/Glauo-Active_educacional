type Row = Record<string, unknown>;

function text(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Row;
    return String(row.nome || row.name || row.celular || row.telefone || row.email || "").trim();
  }
  return String(value || "").trim();
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function normalize(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function firstPresent(...values: unknown[]) {
  return values.map(text).find(Boolean) || "";
}

function digits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function compactRow(row: Row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => text(value))) as Row;
}

export function studentDisplayName(student: Row | null | undefined) {
  return text(student?.nome || student?.name || student?.nome_completo || student?.aluno || student?.aluno_nome || student?.login || student?.usuario);
}

export function studentLogin(student: Row | null | undefined) {
  return text(student?.login || student?.usuario || student?.codigo);
}

export function studentIdentifier(student: Row | null | undefined) {
  return text(student?.id || student?._id || student?.uuid || student?.codigo || student?.matricula || studentLogin(student) || student?.cpf || studentDisplayName(student));
}

export function studentPhone(student: Row | null | undefined) {
  const responsavel = asRow(student?.responsavel);
  return firstPresent(
    student?.responsavel_telefone,
    student?.telefone_responsavel,
    student?.celular_responsavel,
    student?.whatsapp_responsavel,
    responsavel.telefone,
    responsavel.celular,
    responsavel.whatsapp,
    student?.celular,
    student?.whatsapp,
    student?.telefone
  );
}

export function studentEmail(student: Row | null | undefined) {
  const responsavel = asRow(student?.responsavel);
  return firstPresent(
    student?.responsavel_email,
    student?.email_responsavel,
    student?.emailResponsavel,
    responsavel.email,
    student?.aluno_email,
    student?.email
  );
}

export function studentDocument(student: Row | null | undefined) {
  const responsavel = asRow(student?.responsavel);
  return digits(firstPresent(
    student?.cpf_aluno,
    student?.cpf_do_aluno,
    student?.cpf,
    student?.aluno_cpf,
    student?.responsavel_cpf,
    student?.cpf_responsavel,
    student?.documento,
    student?.documento_pagador,
    responsavel.cpf,
    responsavel.cpf_responsavel,
    responsavel.documento,
    responsavel.cnpj,
    student?.cnpj
  ));
}

export function studentFinanceData(student: Row | null | undefined) {
  if (!student) return {};
  const responsavel = asRow(student.responsavel);
  const nome = studentDisplayName(student);
  const login = studentLogin(student);
  const phone = studentPhone(student);
  const email = studentEmail(student);
  const document = studentDocument(student);
  const responsavelNome = firstPresent(student.responsavel_nome, student.responsavel_financeiro, responsavel.nome, responsavel.name);
  const responsavelCpf = digits(firstPresent(student.responsavel_cpf, student.cpf_responsavel, responsavel.cpf, responsavel.documento, responsavel.cnpj));

  return compactRow({
    aluno_id: studentIdentifier(student),
    aluno: nome,
    nome,
    aluno_login: login,
    login,
    aluno_email: email,
    email,
    responsavel_email: email,
    telefone: phone,
    whatsapp: phone,
    responsavel_telefone: phone,
    responsavel: responsavelNome,
    responsavel_nome: responsavelNome,
    cpf: document,
    cpf_aluno: document,
    responsavel_cpf: responsavelCpf,
    turma: firstPresent(student.turma, student.classe),
    classe: firstPresent(student.turma, student.classe),
    livro: firstPresent(student.livro, student.book),
    cep: firstPresent(student.cep, student.zip_code, student.postal_code, responsavel.cep, responsavel.zip_code),
    rua: firstPresent(student.rua, student.logradouro, student.street_name, responsavel.rua, responsavel.logradouro, responsavel.street_name),
    numero: firstPresent(student.numero, student.number, student.street_number, responsavel.numero, responsavel.number, responsavel.street_number),
    complemento: firstPresent(student.complemento, responsavel.complemento),
    bairro: firstPresent(student.bairro, student.neighborhood, responsavel.bairro, responsavel.neighborhood),
    cidade: firstPresent(student.cidade, student.city, responsavel.cidade, responsavel.city),
    estado: firstPresent(student.estado, student.uf, student.federal_unit, responsavel.estado, responsavel.uf, responsavel.federal_unit),
    endereco: firstPresent(student.endereco, student.endereco_completo, responsavel.endereco, responsavel.endereco_completo),
    valor_mensalidade_cadastro: firstPresent(student.valor_mensalidade, student.mensalidade, student.plano_valor),
  });
}

export function findStudentForCharge(students: Row[], charge: Row) {
  const id = normalize(charge.aluno_id || charge.student_id || charge.id_aluno);
  const login = normalize(charge.aluno_login || charge.login || charge.usuario);
  const name = normalize(charge.aluno || charge.nome || charge.pagador);
  const email = normalize(charge.email || charge.aluno_email || charge.responsavel_email || charge.email_responsavel);
  const cpf = digits(charge.cpf || charge.cpf_aluno || charge.responsavel_cpf || charge.documento || charge.documento_pagador);

  return students.find((student) => {
    const studentIds = [student.id, student._id, student.uuid, student.codigo, student.matricula].map(normalize).filter(Boolean);
    const studentLogins = [student.login, student.usuario, student.aluno_login, student.email].map(normalize).filter(Boolean);
    const studentNames = [student.nome, student.name, student.nome_completo, student.aluno].map(normalize).filter(Boolean);
    const studentEmails = [student.email, student.aluno_email, student.responsavel_email, student.email_responsavel, asRow(student.responsavel).email].map(normalize).filter(Boolean);
    const studentDocs = [student.cpf, student.cpf_aluno, student.responsavel_cpf, student.cpf_responsavel, asRow(student.responsavel).cpf].map(digits).filter(Boolean);

    return Boolean(
      (id && studentIds.includes(id)) ||
      (login && studentLogins.includes(login)) ||
      (email && studentEmails.includes(email)) ||
      (cpf && studentDocs.includes(cpf)) ||
      (name && studentNames.some((studentName) => studentName === name || (name.length > 8 && (studentName.includes(name) || name.includes(studentName)))))
    );
  }) || null;
}

export function enrichChargeWithStudent(charge: Row, students: Row[]) {
  const student = findStudentForCharge(students, charge);
  if (!student) return charge;
  return {
    ...charge,
    ...studentFinanceData(student),
    student_data_source: "cadastro_aluno",
    student_data_synced_at: new Date().toISOString(),
  };
}
