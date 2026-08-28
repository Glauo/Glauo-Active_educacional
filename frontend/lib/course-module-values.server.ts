import { dbGet } from "./db";
import { migrateModule, teacherClassValueByModule } from "./course-modules";

type ValuesConfig = Record<string, unknown>;

function moneyValue(value: unknown) {
  const raw = String(value ?? "").trim().replace(/[^\d,.-]/g, "").replace(",", ".");
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

const CONFIG_KEYS: Record<string, string> = {
  "Aula em Turma": "valor_aula_turma",
  "Aula Teens Presencial": "valor_aula_teens",
  "Aulas VIP Personalizadas": "valor_aula_vip",
  "Intensivo Online Ouro": "valor_aula_intensivo",
  "Reposicao de Aula": "valor_aula_reposicao",
};

export async function configuredTeacherClassValue(moduleName: unknown): Promise<number> {
  const module = migrateModule(moduleName);
  const config = await dbGet<ValuesConfig>("sistema_config.json");
  const configured = moneyValue(config?.[CONFIG_KEYS[module]]);
  return configured || teacherClassValueByModule(module);
}
