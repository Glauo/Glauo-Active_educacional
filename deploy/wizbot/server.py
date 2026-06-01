import datetime
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, quote, urlencode, urlsplit
import urllib.error
import urllib.request

from openai import OpenAI


_STATE_LOCK = threading.Lock()


def _norm_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _digits(value):
    return re.sub(r"\D+", "", str(value or ""))


def _normalize_whatsapp_number(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    match = re.search(r"(\d{10,15})", raw)
    digits = match.group(1) if match else _digits(raw)
    if not digits:
        return ""
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) in (10, 11):
        digits = "55" + digits
    return digits


def _get_groq_api_key():
    return str(os.getenv("GROQ_API_KEY", "")).strip() or str(os.getenv("ACTIVE_GROQ_API_KEY", "")).strip()


def _get_model_name():
    return str(os.getenv("ACTIVE_WIZ_MODEL", "")).strip() or str(os.getenv("ACTIVE_CHATBOT_MODEL", "llama-3.3-70b-versatile")).strip()


def _env_flag(name, default=False):
    raw = str(os.getenv(name, "")).strip().lower()
    if not raw:
        return bool(default)
    return raw in {"1", "true", "yes", "on", "sim"}


def _state_path():
    raw = str(os.getenv("WIZ_STATE_PATH", "")).strip()
    if raw:
        return raw
    return os.path.join(os.path.dirname(__file__), "wizbot_state.json")


def _default_state():
    return {
        "bot_paused": _env_flag("WIZBOT_PAUSED", False),
        "paused_contacts": {},
        "recent_auto_replies": [],
    }


def _load_state():
    path = _state_path()
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
            if isinstance(data, dict):
                merged = _default_state()
                merged.update(data)
                return merged
    except FileNotFoundError:
        pass
    except Exception:
        pass
    return _default_state()


def _save_state(data):
    path = _state_path()
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def _set_bot_paused(paused, by_number=""):
    with _STATE_LOCK:
        data = _load_state()
        data["bot_paused"] = bool(paused)
        data["bot_pause_control"] = {
            "by": _normalize_whatsapp_number(by_number),
            "updated_at": datetime.datetime.utcnow().isoformat() + "Z",
        }
        _save_state(data)


def _is_bot_paused():
    if _env_flag("WIZBOT_PAUSED", False):
        return True
    with _STATE_LOCK:
        data = _load_state()
    return bool(data.get("bot_paused", False))


def _remember_auto_reply(number, text):
    now = time.time()
    normalized = _normalize_whatsapp_number(number)
    preview = str(text or "").strip()
    if not (normalized and preview):
        return
    with _STATE_LOCK:
        data = _load_state()
        recent = [item for item in data.get("recent_auto_replies", []) if now - float(item.get("ts", 0) or 0) <= 180]
        recent.append({"number": normalized, "text": preview, "ts": now})
        data["recent_auto_replies"] = recent[-50:]
        _save_state(data)


def _is_recent_auto_reply(number, text):
    now = time.time()
    normalized = _normalize_whatsapp_number(number)
    preview = str(text or "").strip()
    with _STATE_LOCK:
        data = _load_state()
        recent = [item for item in data.get("recent_auto_replies", []) if now - float(item.get("ts", 0) or 0) <= 180]
        data["recent_auto_replies"] = recent
        _save_state(data)
    return any(item.get("number") == normalized and str(item.get("text", "")).strip() == preview for item in recent)


def _pause_contact(number, reason="manual"):
    normalized = _normalize_whatsapp_number(number)
    if not normalized:
        return
    with _STATE_LOCK:
        data = _load_state()
        paused = dict(data.get("paused_contacts", {}) or {})
        paused[normalized] = {
            "reason": str(reason or "manual"),
            "paused_at": datetime.datetime.utcnow().isoformat() + "Z",
        }
        data["paused_contacts"] = paused
        _save_state(data)


def _resume_contact(number):
    normalized = _normalize_whatsapp_number(number)
    if not normalized:
        return False
    with _STATE_LOCK:
        data = _load_state()
        paused = dict(data.get("paused_contacts", {}) or {})
        existed = normalized in paused
        paused.pop(normalized, None)
        data["paused_contacts"] = paused
        _save_state(data)
    return existed


def _is_contact_paused(number):
    normalized = _normalize_whatsapp_number(number)
    if not normalized:
        return False
    with _STATE_LOCK:
        data = _load_state()
        paused = dict(data.get("paused_contacts", {}) or {})
    return normalized in paused


def _escalation_whatsapp_number():
    return _normalize_whatsapp_number(
        str(os.getenv("WIZ_ESCALATION_WHATSAPP", "")).strip() or "5516993804499"
    )


def _create_request_code():
    return f"WZ{datetime.datetime.utcnow().strftime('%d%H%M%S')}"


def _register_pending_request(customer_number, question):
    code = _create_request_code()
    with _STATE_LOCK:
        data = _load_state()
        pending = dict(data.get("pending_requests", {}) or {})
        while code in pending:
            code = _create_request_code()
        pending[code] = {
            "customer_number": _normalize_whatsapp_number(customer_number),
            "question": str(question or "").strip(),
            "created_at": datetime.datetime.utcnow().isoformat() + "Z",
            "status": "open",
        }
        data["pending_requests"] = pending
        _save_state(data)
    return code


def _complete_pending_request(code):
    ref = str(code or "").strip().upper()
    with _STATE_LOCK:
        data = _load_state()
        pending = dict(data.get("pending_requests", {}) or {})
        item = dict(pending.get(ref, {}) or {})
        if not item:
            return {}
        item["status"] = "answered"
        item["answered_at"] = datetime.datetime.utcnow().isoformat() + "Z"
        pending[ref] = item
        data["pending_requests"] = pending
        _save_state(data)
    return item


def _set_values_authorized(enabled, by_number=""):
    with _STATE_LOCK:
        data = _load_state()
        data["values_authorized"] = {
            "enabled": bool(enabled),
            "by": _normalize_whatsapp_number(by_number),
            "updated_at": datetime.datetime.utcnow().isoformat() + "Z",
        }
        _save_state(data)


def _values_are_authorized():
    with _STATE_LOCK:
        data = _load_state()
        info = dict(data.get("values_authorized", {}) or {})
    return bool(info.get("enabled"))


def _was_greeted_recently(number, window_seconds=21600):
    normalized = _normalize_whatsapp_number(number)
    if not normalized:
        return False
    now = time.time()
    with _STATE_LOCK:
        data = _load_state()
        greeted = dict(data.get("greeted_contacts", {}) or {})
        last_ts = float(greeted.get(normalized, 0) or 0)
        greeted = {k: v for k, v in greeted.items() if now - float(v or 0) <= window_seconds}
        data["greeted_contacts"] = greeted
        _save_state(data)
    return now - last_ts <= window_seconds


def _mark_greeted(number):
    normalized = _normalize_whatsapp_number(number)
    if not normalized:
        return
    with _STATE_LOCK:
        data = _load_state()
        greeted = dict(data.get("greeted_contacts", {}) or {})
        greeted[normalized] = time.time()
        data["greeted_contacts"] = greeted
        _save_state(data)


def _append_conversation_message(number, role, text, keep=40):
    normalized = _normalize_whatsapp_number(number)
    preview = str(text or "").strip()
    if not (normalized and preview):
        return
    with _STATE_LOCK:
        data = _load_state()
        conversations = dict(data.get("conversations", {}) or {})
        items = list(conversations.get(normalized, []) or [])
        items.append(
            {
                "role": str(role or "user"),
                "content": preview,
                "ts": time.time(),
            }
        )
        conversations[normalized] = items[-keep:]
        data["conversations"] = conversations
        _save_state(data)


def _conversation_messages(number, keep=8):
    normalized = _normalize_whatsapp_number(number)
    if not normalized:
        return []
    with _STATE_LOCK:
        data = _load_state()
        conversations = dict(data.get("conversations", {}) or {})
        items = list(conversations.get(normalized, []) or [])
    messages = []
    for item in items[-keep:]:
        role = str(item.get("role", "user")).strip() or "user"
        content = str(item.get("content", "")).strip()
        if content:
            messages.append({"role": role, "content": content})
    return messages


def _has_conversation_history(number):
    return bool(_conversation_messages(number, keep=1))


def _wiz_control_command(text):
    norm = _norm_text(text)
    stop_cmds = {"!parar", "parar", "!pausar", "pausar", "assumir controle", "!assumir", "bot parar"}
    resume_cmds = {"!retomar", "retomar", "!continuar", "continuar", "!iniciar", "iniciar bot", "retomar bot"}
    if norm in stop_cmds:
        return "stop"
    if norm in resume_cmds:
        return "resume"
    return ""


def _admin_whatsapp_numbers():
    numbers = set()
    raw = (
        str(os.getenv("ACTIVE_ADMIN_WHATSAPP", "")).strip()
        or str(os.getenv("ACTIVE_ADMIN_WHATSAPPS", "")).strip()
        or str(os.getenv("ACTIVE_ADMIN_NUMBERS", "")).strip()
    )
    for chunk in re.split(r"[;, \n]+", raw):
        num = _normalize_whatsapp_number(chunk)
        if num:
            numbers.add(num)
    return numbers


def _extract_text_candidates(obj, found=None):
    found = found or []
    if isinstance(obj, dict):
        for key, value in obj.items():
            key_norm = _norm_text(key)
            if isinstance(value, str) and key_norm in {"text", "body", "conversation", "message", "caption", "content", "title"}:
                txt = str(value).strip()
                if txt:
                    found.append(txt)
            elif isinstance(value, dict) and key_norm in {
                "messagedata",
                "textmessagedata",
                "extendedtextmessagedata",
                "imagemessagedata",
                "videomessagedata",
                "documentmessagedata",
                "quotedmessage",
                "senderdata",
                "msgcontent",
                "messagecontextinfo",
            }:
                _extract_text_candidates(value, found)
            else:
                _extract_text_candidates(value, found)
    elif isinstance(obj, list):
        for item in obj:
            _extract_text_candidates(item, found)
    return found


def _extract_sender_candidates(obj, found=None):
    found = found or []
    if isinstance(obj, dict):
        for key, value in obj.items():
            key_norm = _norm_text(key)
            if isinstance(value, str) and key_norm in {"from", "sender", "phone", "number", "remotejid", "chatid", "author", "participant"}:
                num = _normalize_whatsapp_number(value)
                if num:
                    found.append(num)
            elif isinstance(value, dict) and key_norm in {"senderdata", "key", "chat", "contact"}:
                _extract_sender_candidates(value, found)
            else:
                _extract_sender_candidates(value, found)
    elif isinstance(obj, list):
        for item in obj:
            _extract_sender_candidates(item, found)
    return found


def _extract_message_id(obj):
    if isinstance(obj, dict):
        for key in ("id", "messageId", "message_id"):
            value = obj.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for value in obj.values():
            nested = _extract_message_id(value)
            if nested:
                return nested
    elif isinstance(obj, list):
        for item in obj:
            nested = _extract_message_id(item)
            if nested:
                return nested
    return ""


def _extract_from_me(obj):
    if isinstance(obj, dict):
        for key in ("fromMe", "from_me", "isFromMe", "self"):
            if key in obj:
                return bool(obj.get(key))
        for value in obj.values():
            if _extract_from_me(value):
                return True
    elif isinstance(obj, list):
        for item in obj:
            if _extract_from_me(item):
                return True
    return False


def _extract_incoming(payload):
    sender = ""
    texts = [t for t in _extract_text_candidates(payload) if t and not t.startswith("http")]
    if isinstance(payload, dict):
        connected_phone = _normalize_whatsapp_number(payload.get("connectedPhone", ""))
        sender = (
            _normalize_whatsapp_number(payload.get("sender", ""))
            or _normalize_whatsapp_number(payload.get("from", ""))
            or _normalize_whatsapp_number(((payload.get("chat") or {}).get("id", "")))
        )
        sender_data = payload.get("senderData") or payload.get("sender_data") or {}
        if not sender and isinstance(sender_data, dict):
            sender = (
                _normalize_whatsapp_number(sender_data.get("chatId", ""))
                or _normalize_whatsapp_number(sender_data.get("sender", ""))
                or _normalize_whatsapp_number(sender_data.get("remoteJid", ""))
                or _normalize_whatsapp_number(sender_data.get("from", ""))
            )
        message_data = payload.get("messageData") or payload.get("message_data") or {}
        if isinstance(message_data, dict) and not texts:
            direct_candidates = [
                message_data.get("conversation", ""),
                ((message_data.get("textMessageData") or {}).get("textMessage", "")),
                ((message_data.get("extendedTextMessageData") or {}).get("text", "")),
                ((message_data.get("imageMessageData") or {}).get("caption", "")),
                ((message_data.get("videoMessageData") or {}).get("caption", "")),
                ((message_data.get("documentMessageData") or {}).get("caption", "")),
                ((message_data.get("buttonsResponseMessage") or {}).get("selectedDisplayText", "")),
                ((message_data.get("listResponseMessage") or {}).get("title", "")),
            ]
            texts = [str(x).strip() for x in direct_candidates if str(x).strip()]
        msg_content = payload.get("msgContent") or payload.get("msgcontent") or {}
        if isinstance(msg_content, dict) and not texts:
            direct_candidates = [
                msg_content.get("conversation", ""),
                ((msg_content.get("extendedTextMessage") or {}).get("text", "")),
                ((msg_content.get("imageMessage") or {}).get("caption", "")),
                ((msg_content.get("videoMessage") or {}).get("caption", "")),
                ((msg_content.get("documentMessage") or {}).get("caption", "")),
                ((msg_content.get("buttonsResponseMessage") or {}).get("selectedDisplayText", "")),
                ((msg_content.get("listResponseMessage") or {}).get("title", "")),
            ]
            texts = [str(x).strip() for x in direct_candidates if str(x).strip()]
        key_obj = payload.get("key") or {}
        if not sender and isinstance(key_obj, dict):
            sender = (
                _normalize_whatsapp_number(key_obj.get("remoteJid", ""))
                or _normalize_whatsapp_number(key_obj.get("participant", ""))
            )
        if not sender:
            candidates = [
                num
                for num in _extract_sender_candidates(payload)
                if num and (not connected_phone or num != connected_phone)
            ]
            sender = next(iter(candidates), "")
    return {
        "id": _extract_message_id(payload),
        "sender": sender,
        "text": texts[0].strip() if texts else "",
        "from_me": _extract_from_me(payload),
    }


def _http_post_json(url, headers, payload, timeout=20):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(str(key), str(value))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return int(resp.status), resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raw = exc.read() if hasattr(exc, "read") else b""
        return int(exc.code), raw.decode("utf-8", errors="replace")
    except Exception as exc:
        return None, str(exc)


def _send_whatsapp_wapi(number, text):
    number = _normalize_whatsapp_number(number)
    base_url = str(os.getenv("WAPI_BASE_URL", "")).strip()
    token = str(os.getenv("WAPI_TOKEN", "")).strip()
    instance_id = str(os.getenv("WAPI_INSTANCE_ID", "")).strip() or str(os.getenv("WAPI_INSTANCE", "")).strip()
    if not (number and text and base_url and token and instance_id):
        return False, "WAPI incompleto"
    split = urlsplit(base_url)
    base_root = f"{split.scheme}://{split.netloc}".rstrip("/")
    inst_q = quote(instance_id, safe="")
    urls = [
        f"{base_root}/v1/message/send-text?instanceId={inst_q}",
        f"{base_root}/api/v1/message/send-text?instanceId={inst_q}",
        f"{base_root}/message/send-text?instanceId={inst_q}",
    ]
    payloads = [
        {"phone": number, "message": text},
        {"number": number, "message": text},
        {"to": number, "text": text},
        {"instanceId": instance_id, "phone": number, "message": text},
    ]
    headers_list = [
        {"Authorization": token if token.lower().startswith("bearer ") else f"Bearer {token}", "Accept": "application/json"},
        {"apikey": token, "Accept": "application/json"},
        {"x-api-key": token, "Accept": "application/json"},
    ]
    for url in urls:
        for headers in headers_list:
            for payload in payloads:
                status, body = _http_post_json(url, headers, payload)
                print(
                    f"[wizbot] send attempt url={url} status={status} phone={number} preview={str(body or '')[:160]}",
                    flush=True,
                )
                if status is not None and 200 <= int(status) < 300:
                    _remember_auto_reply(number, text)
                    return True, f"enviado HTTP {status}"
                preview = str(body or "").lower()[:160]
                if any(flag in preview for flag in ("success", "sucesso", "sent")):
                    _remember_auto_reply(number, text)
                    return True, preview
    return False, "falha ao enviar via WAPI"


def _needs_direct_handoff(text):
    norm = _norm_text(text)
    keywords = {
        "preco",
        "preÃƒÆ’Ã‚Â§os",
        "preco?",
        "preÃƒÆ’Ã‚Â§o",
        "preÃƒÆ’Ã‚Â§o?",
        "valor",
        "valores",
        "mensalidade",
        "mensalidades",
        "matricula",
        "matrÃƒÆ’Ã‚Â­cula",
        "rematricula",
        "rematrÃƒÆ’Ã‚Â­cula",
        "material didatico",
        "material didÃƒÆ’Ã‚Â¡tico",
        "quanto custa",
        "quanto fica",
        "investimento",
        "desconto",
        "parcela",
        "parcelas",
    }
    return any(token in norm for token in keywords)


def _reply_mentions_values(text):
    raw = str(text or "").strip()
    norm = _norm_text(raw)
    if not raw:
        return False
    money_keywords = {
        "preco",
        "valor",
        "valores",
        "mensalidade",
        "mensalidades",
        "matricula",
        "rematricula",
        "material didatico",
        "investimento",
        "desconto",
        "parcela",
        "parcelas",
        "taxa",
        "taxas",
    }
    has_money_word = any(token in norm for token in money_keywords)
    has_money_number = bool(
        re.search(r"(r\\$\\s*\\d|\\d+[\\.,]\\d{2}|\\d+\\s*reais|\\d+\\s*/\\s*mes|\\d+\\s*x)", norm)
    )
    return has_money_word and has_money_number


def _needs_value_guidance(text):
    norm = _norm_text(text)
    keywords = {
        "preco",
        "preco?",
        "valor",
        "valores",
        "mensalidade",
        "mensalidades",
        "matricula",
        "rematricula",
        "material didatico",
        "investimento",
        "desconto",
        "parcela",
        "parcelas",
        "taxa",
        "taxas",
        "quanto custa",
        "quanto fica",
    }
    return any(token in norm for token in keywords)


def _extract_sector_reply(text):
    raw = str(text or "").strip()
    match = re.match(r"^\s*#?(WZ\d{8})\s*[:\-]?\s*(.+)$", raw, re.IGNORECASE | re.DOTALL)
    if not match:
        return "", ""
    return match.group(1).upper(), match.group(2).strip()


def _sector_control_command(text):
    norm = _norm_text(text)
    if norm in {"autorizado", "(autorizado)", "!autorizar valores", "autorizar valores"}:
        return "authorize_values"
    if norm in {"bloquear valores", "(bloquear valores)", "!bloquear valores", "desautorizar valores"}:
        return "block_values"
    return ""


def _generate_reply(sender, text):
    api_key = _get_groq_api_key()
    user_text = str(text or "").strip()
    user_norm = _norm_text(user_text)
    if user_norm in {"oi", "ola", "bom dia", "boa tarde", "boa noite", "menu", "inicio"} and not _has_conversation_history(sender) and not _was_greeted_recently(sender):
        _mark_greeted(sender)
        return (
            "Ola! \U0001F60A\n\n"
            "Que bom falar com voce. Aqui e o atendimento da Mister Wiz. \U0001F4D8\n\n"
            "Posso te ajudar com curso, matricula, teste de nivel, aula experimental ou atendimento da escola.\n\n"
            "Me fala seu nome e para quem seria o atendimento? \U0001F449"
        )
    if not api_key:
        return (
            "O atendimento automatico do Mister Wiz esta temporariamente indisponivel. "
            "Por favor, envie sua duvida novamente em alguns minutos."
        )
    values_prompt = []
    if _values_are_authorized():
        values_prompt = [
            "Valores oficiais atualmente autorizados para informar, somente quando a pergunta for claramente sobre valores:",
            "Curso em Turma: presencial ou online. Mensalidade R$ 312,00. Matricula R$ 299,00. Material R$ 550,00.",
            "Intensivo VIP: online. Mensalidade R$ 299,00. Matricula gratis neste mes. Material R$ 550,00.",
            "VIP Particular: presencial ou online. R$ 150,00 por hora. Pacote de 10 aulas: R$ 1.300,00. Sem material padrao nesta tabela.",
            "Kids Completo: presencial. Mensalidade R$ 380,00. Matricula R$ 299,00. Material R$ 550,00.",
            "Terceira Idade: presencial. Mensalidade R$ 299,00. Matricula R$ 299,00. Material R$ 550,00.",
            "Antes de informar qualquer valor, primeiro gere interesse e mostre o diferencial da escola.",
            "Ao informar valores, deixe claro que condicoes podem depender de confirmacao final da equipe.",
        ]
    system_prompt = "\n".join(
        [
            "Voce e o Bot Mister Wiz da escola de ingles Mister Wiz.",
            "Atenda pelo WhatsApp em portugues do Brasil.",
            "Responda de forma objetiva, educada e profissional.",
            "Soe como uma pessoa real da escola, nao como robo.",
            "Use linguagem natural, calor humano e frases que passem acolhimento e seguranca.",
            "Pode usar poucos emojis com moderacao, principalmente para acolhimento, confirmacao ou proximo passo.",
            "Evite resposta seca, mecanica ou excessivamente padrao.",
            "Quando for uma primeira saudacao, responda de forma curta, clara e acolhedora.",
            "Nao repita saudacoes de boas-vindas em mensagens seguintes.",
            "Nao repita a mesma resposta se o contato fizer perguntas diferentes ou pedir mais detalhes.",
            "Considere o contexto recente da conversa antes de responder.",
            "Quando ja houver historico com o contato, retome a conversa do ponto em que ela parou em vez de recomecar do zero.",
            "Se o contato voltar depois de um tempo, reconheca o contexto anterior e continue a partir da necessidade dele.",
            "A Mister Wiz e uma escola de idiomas focada em resultado real no aprendizado do ingles, com metodologia moderna, pratica e voltada para a fluencia desde as primeiras aulas.",
            "Diferente de metodos tradicionais focados apenas em gramatica, a Mister Wiz estimula comunicacao, confianca, interpretacao e aplicacao do idioma no dia a dia.",
            "O objetivo e que o aluno nao apenas entenda ingles, mas consiga falar, interpretar e se expressar com seguranca.",
            "Apresente os formatos com naturalidade quando fizer sentido: Curso de Ingles em Turmas, Curso VIP Personalizado, Curso Intensivo VIP, Curso Completo Teens e Curso para Terceira Idade.",
            "Curso em Turmas: aulas online ou presenciais, ambiente colaborativo, evolucao continua com acompanhamento e otimo custo-beneficio.",
            "Curso VIP Personalizado: horarios e dias flexiveis, aulas individuais ou em dupla, online ou presencial, com conteudo adaptado ao objetivo do aluno.",
            "Curso Intensivo VIP: foco em resultado acelerado, ate 4 aulas por semana, formato online ou hibrido e possibilidade de formacao e fluencia em ate 12 meses, dependendo do perfil e da dedicacao.",
            "Curso Completo Teens: foco em fluencia, com desenvolvimento complementar em empreendedorismo e inteligencia emocional.",
            "Curso para Terceira Idade: ritmo adaptado, aulas leves, estimulo cognitivo e ambiente acolhedor.",
            "Todos os cursos podem acontecer online, presencialmente ou em formato hibrido, dependendo da modalidade.",
            "Antes de falar sobre valores, faca a pessoa se interessar muito pelo curso, explicando diferenciais, beneficios, metodologia e adequacao ao perfil dela.",
            "Antes de qualquer valor, mostre por que a Mister Wiz e diferente e por que a experiencia gera evolucao real.",
            "Ajude com duvidas sobre escola, ingles, secretaria, agenda, financeiro e portal.",
            "Quando a pergunta depender de confirmacao interna, valores, condicoes comerciais ou informacoes nao confirmadas, comece a resposta exatamente com [ENCAMINHAR_SETOR].",
            "Depois do marcador [ENCAMINHAR_SETOR], escreva uma mensagem curta informando que vai verificar com o setor responsavel e responder assim que tiver retorno.",
            "Nunca invente valores, precos, mensalidades, matriculas, rematriculas, descontos, parcelas ou taxas.",
            "Se os valores nao estiverem autorizados, qualquer conversa sobre valor ou condicao comercial deve ser encaminhada com [ENCAMINHAR_SETOR].",
            "Se os valores estiverem autorizados, use apenas os valores oficiais informados neste prompt e nunca crie valores extras.",
            "Quando nao tiver dados confirmados, diga isso com clareza.",
            "Nunca invente informacoes internas.",
            f"Numero remetente identificado: {sender}.",
        ]
        + values_prompt
    )
    client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(_conversation_messages(sender, keep=8))
    messages.append({"role": "user", "content": user_text})
    result = client.chat.completions.create(
        model=_get_model_name(),
        messages=messages,
        temperature=0.2,
        max_tokens=700,
    )
    answer = (result.choices[0].message.content or "").strip()
    return answer or "Nao consegui responder agora. Tente novamente com mais detalhes."


def _manual_contact_command(text):
    norm = _norm_text(text)
    if norm in {
        "!assumir",
        "!assumir atendimento",
        "assumir",
        "assumir atendimento",
        "assumir conversa",
        "atendimento humano",
        "!pausar bot",
        "pausar bot",
        "!humano",
        "humano",
        "!manual",
        "manual",
    }:
        return "pause"
    if norm in {
        "!retomar",
        "!retomar bot",
        "retomar",
        "retomar bot",
        "!liberar bot",
        "liberar bot",
        "!auto",
        "auto",
    }:
        return "resume"
    return ""


def _contact_number_for_payload(payload, incoming):
    connected_phone = ""
    if isinstance(payload, dict):
        connected_phone = _normalize_whatsapp_number(payload.get("connectedPhone", ""))
    sender = _normalize_whatsapp_number((incoming or {}).get("sender", ""))
    if sender and (not connected_phone or sender != connected_phone):
        return sender
    if isinstance(payload, dict):
        chat_obj = payload.get("chat") or {}
        if isinstance(chat_obj, dict):
            chat_id = _normalize_whatsapp_number(chat_obj.get("id", ""))
            if chat_id and (not connected_phone or chat_id != connected_phone):
                return chat_id
        sender_data = payload.get("senderData") or payload.get("sender_data") or {}
        if isinstance(sender_data, dict):
            for key in ("chatId", "remoteJid", "from", "sender"):
                candidate = _normalize_whatsapp_number(sender_data.get(key, ""))
                if candidate and (not connected_phone or candidate != connected_phone):
                    return candidate
        key_obj = payload.get("key") or {}
        if isinstance(key_obj, dict):
            for key in ("remoteJid", "participant"):
                candidate = _normalize_whatsapp_number(key_obj.get(key, ""))
                if candidate and (not connected_phone or candidate != connected_phone):
                    return candidate
    return sender


def _authorized_request(handler):
    required = str(os.getenv("ACTIVE_WIZ_WEBHOOK_TOKEN", "")).strip()
    if not required:
        return True
    header_token = str(handler.headers.get("X-Webhook-Token", "")).strip()
    query = dict(parse_qsl(urlsplit(handler.path).query))
    return required == header_token or required == str(query.get("token", "")).strip()


class WizWebhookHandler(BaseHTTPRequestHandler):
    server_version = "WizbotStandalone/1.0"

    def _write_json(self, status_code, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(int(status_code))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        print(f"[wizbot] GET path={self.path}", flush=True)
        if self.path.startswith("/health"):
            self._write_json(200, {"ok": True, "service": "wizbot-standalone", "paused": _is_bot_paused()})
            return
        if self.path.startswith("/wapi/webhook"):
            paused = _is_bot_paused()
            self._write_json(200, {"ok": True, "message": "Webhook pausado" if paused else "Webhook ativo", "paused": paused})
            return
        self._write_json(404, {"ok": False, "message": "Not found"})

    def do_POST(self):
        print(f"[wizbot] POST path={self.path}", flush=True)
        if not self.path.startswith("/wapi/webhook"):
            self._write_json(404, {"ok": False, "message": "Not found"})
            return
        if not _authorized_request(self):
            print("[wizbot] token invalido", flush=True)
            self._write_json(403, {"ok": False, "message": "Token invalido"})
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(body.decode("utf-8", errors="replace") or "{}")
        except Exception:
            print(f"[wizbot] json invalido body={body[:200]}", flush=True)
            self._write_json(400, {"ok": False, "message": "JSON invalido"})
            return
        incoming = _extract_incoming(payload)
        sender = incoming.get("sender", "")
        text = str(incoming.get("text", "")).strip()
        contact_number = _contact_number_for_payload(payload, incoming)
        print(
            f"[wizbot] incoming sender={sender} contact={contact_number} from_me={incoming.get('from_me')} text={text[:200]}",
            flush=True,
        )
        if incoming.get("from_me") and contact_number:
            if _is_recent_auto_reply(contact_number, text):
                print("[wizbot] ignored self echo from auto reply", flush=True)
                self._write_json(200, {"ok": True, "ignored": True, "echo": True})
                return
            contact_cmd = _manual_contact_command(text)
            if contact_cmd == "resume":
                resumed = _resume_contact(contact_number)
                print(f"[wizbot] manual resume contact={contact_number} resumed={resumed}", flush=True)
                self._write_json(200, {"ok": True, "manual_control": "resume", "contact": contact_number})
                return
            if contact_cmd == "pause":
                _pause_contact(contact_number, "manual_operator")
                print(f"[wizbot] manual takeover contact={contact_number} cmd=pause", flush=True)
                self._write_json(200, {"ok": True, "manual_control": "pause", "contact": contact_number})
                return
            print("[wizbot] ignored outgoing operator message without control command", flush=True)
            self._write_json(200, {"ok": True, "ignored": True, "outgoing": True})
            return
        if not sender or not text:
            print(f"[wizbot] raw payload={body.decode('utf-8', errors='replace')[:1500]}", flush=True)
            print("[wizbot] ignored incoming", flush=True)
            self._write_json(200, {"ok": True, "ignored": True})
            return
        cmd = _wiz_control_command(text)
        if sender in _admin_whatsapp_numbers() and cmd:
            _set_bot_paused(cmd == "stop", sender)
            reply = "Bot Mister Wiz pausado." if cmd == "stop" else "Bot Mister Wiz retomado."
            ok_send, status_send = _send_whatsapp_wapi(sender, reply)
            print(f"[wizbot] admin control cmd={cmd} ok={ok_send} status={status_send}", flush=True)
            self._write_json(200, {"ok": ok_send, "message": status_send, "control": cmd, "paused": cmd == "stop"})
            return
        if _is_bot_paused():
            print(f"[wizbot] bot paused sender={sender}", flush=True)
            self._write_json(200, {"ok": True, "ignored": True, "reason": "bot paused"})
            return
        if _is_contact_paused(sender):
            print(f"[wizbot] contact paused sender={sender}", flush=True)
            self._write_json(200, {"ok": True, "ignored": True, "paused_contact": sender})
            return
        _append_conversation_message(sender, "user", text)
        sector_number = _escalation_whatsapp_number()
        if sender == sector_number:
            ref_code, sector_reply = _extract_sector_reply(text)
            control_cmd = _sector_control_command(text)
            if control_cmd == "authorize_values":
                _set_values_authorized(True, sender)
                ok_send, status_send = _send_whatsapp_wapi(sender, "Valores autorizados para o bot.")
                print(f"[wizbot] values authorized by sector ok={ok_send} status={status_send}", flush=True)
                self._write_json(200, {"ok": ok_send, "message": status_send, "values_authorized": True})
                return
            if control_cmd == "block_values":
                _set_values_authorized(False, sender)
                ok_send, status_send = _send_whatsapp_wapi(sender, "Envio de valores bloqueado no bot.")
                print(f"[wizbot] values blocked by sector ok={ok_send} status={status_send}", flush=True)
                self._write_json(200, {"ok": ok_send, "message": status_send, "values_authorized": False})
                return
            if ref_code and sector_reply:
                pending = _complete_pending_request(ref_code)
                customer_number = _normalize_whatsapp_number(pending.get("customer_number", ""))
                if customer_number:
                    ok_send, status_send = _send_whatsapp_wapi(customer_number, sector_reply)
                    print(
                        f"[wizbot] sector reply ref={ref_code} customer={customer_number} ok={ok_send} status={status_send}",
                        flush=True,
                    )
                    self._write_json(200, {"ok": ok_send, "message": status_send, "relay_ref": ref_code})
                    return
            print("[wizbot] sector message without valid reference", flush=True)
            self._write_json(200, {"ok": True, "ignored": True, "sector": True})
            return
        try:
            if _needs_direct_handoff(text) and not _values_are_authorized():
                if _needs_value_guidance(text):
                    reply = (
                        "Posso te passar essa informacao sim. 😊\n\n"
                        "Antes, quero te orientar da forma certa para nao te passar algo fora do perfil ideal.\n\n"
                        "Na Mister Wiz, a proposta nao e so estudar ingles. O foco e desenvolver comunicacao, confianca e fluencia real, com acompanhamento proximo e uma metodologia mais pratica desde as primeiras aulas.\n\n"
                        "Temos opcao em turma, VIP personalizado, intensivo VIP, Teens e terceira idade, sempre buscando encaixar o formato mais adequado para o objetivo do aluno.\n\n"
                        "[ENCAMINHAR_SETOR] Vou verificar os valores e condicoes com o setor responsavel e te responder assim que eu tiver a informacao confirmada."
                    )
                else:
                    reply = "[ENCAMINHAR_SETOR] Vou verificar isso com o setor responsavel e te responder assim que eu tiver a informacao confirmada."
            else:
                reply = _generate_reply(sender, text)
            if _reply_mentions_values(reply) and not _values_are_authorized():
                print("[wizbot] blocked unconfirmed value reply", flush=True)
                reply = "[ENCAMINHAR_SETOR] Vou verificar isso com o setor responsavel e te responder assim que eu tiver a informacao confirmada."
        except Exception as exc:
            reply = f"Nao consegui responder agora. Erro temporario: {exc}"
            print(f"[wizbot] ai error={exc}", flush=True)
        if "[ENCAMINHAR_SETOR]" in str(reply):
            client_message = str(reply).replace("[ENCAMINHAR_SETOR]", "").strip() or (
                "Vou verificar isso com o setor responsavel e te responder assim que eu tiver a informacao confirmada."
            )
            ref_code = _register_pending_request(sender, text)
            forward_message = (
                f"Nova consulta do chatbot Mister Wiz\n"
                f"Ref: {ref_code}\n"
                f"Cliente: {sender}\n"
                f"Pergunta: {text}\n\n"
                f"Para responder ao cliente pelo bot, envie:\n"
                f"{ref_code} sua resposta aqui"
            )
            ok_sector, status_sector = _send_whatsapp_wapi(sector_number, forward_message)
            ok_send, status_send = _send_whatsapp_wapi(sender, client_message)
            if ok_send:
                _append_conversation_message(sender, "assistant", client_message)
            print(
                f"[wizbot] handoff ref={ref_code} sector_ok={ok_sector} sector_status={status_sector} client_ok={ok_send} client_status={status_send}",
                flush=True,
            )
            self._write_json(
                200,
                {"ok": ok_send, "message": status_send, "handoff": True, "ref": ref_code, "sector_status": status_sector},
            )
            return
        ok_send, status_send = _send_whatsapp_wapi(sender, reply)
        if ok_send:
            _append_conversation_message(sender, "assistant", reply)
        print(f"[wizbot] reply ok={ok_send} status={status_send} text={reply[:200]}", flush=True)
        self._write_json(200, {"ok": ok_send, "message": status_send})

    def log_message(self, fmt, *args):
        return


# ─────────────────────────────────────────────────────────────────────────────
# Agendador de cron: regera boletos sem URL do Mercado Pago todo dia 5 do mes
# ─────────────────────────────────────────────────────────────────────────────


def _get_frontend_base_url():
    """Retorna a URL base do frontend Next.js para chamadas internas."""
    url = str(os.getenv("FRONTEND_INTERNAL_URL", "")).strip()
    if url:
        return url.rstrip("/")
    # Nome do servico na rede interna do Docker Compose
    return "http://ativo_educacional_app:3000"


def _cron_regerar_boletos():
    """Chama a rota /api/financeiro/cron-boletos no frontend Next.js."""
    cron_secret = str(os.getenv("CRON_SECRET", "")).strip()
    if not cron_secret:
        print("[cron-boletos] CRON_SECRET nao configurado, pulando execucao.", flush=True)
        return
    base_url = _get_frontend_base_url()
    url = f"{base_url}/api/financeiro/cron-boletos?secret={cron_secret}"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(body)
                regerados = data.get("regerados", 0)
                erros = data.get("erros", 0)
                print(
                    f"[cron-boletos] Concluido: {regerados} boleto(s) regerado(s), {erros} erro(s).",
                    flush=True,
                )
            except Exception:
                print(f"[cron-boletos] Resposta: {body[:300]}", flush=True)
    except Exception as exc:
        print(f"[cron-boletos] Erro ao chamar rota de cron: {exc}", flush=True)


def _scheduler_loop():
    """
    Loop de agendamento em thread separada.
    Executa a regeracao de boletos todo dia 5 do mes as 06:00 (horario do servidor).
    """
    ultimo_dia_executado = None
    # Aguarda 60s na inicializacao para o frontend subir
    time.sleep(60)
    while True:
        try:
            agora = datetime.datetime.now()
            # Executa todo dia 5 do mes as 06:00
            if agora.day == 5 and agora.hour == 6 and ultimo_dia_executado != agora.date():
                print(
                    f"[cron-boletos] Disparando cron mensal: {agora.strftime('%Y-%m-%d %H:%M:%S')}",
                    flush=True,
                )
                ultimo_dia_executado = agora.date()
                _cron_regerar_boletos()
        except Exception as exc:
            print(f"[cron-boletos] Erro no loop do agendador: {exc}", flush=True)
        # Verifica a cada 30 minutos
        time.sleep(1800)


def main():
    host = str(os.getenv("WIZ_WEBHOOK_HOST", "0.0.0.0")).strip() or "0.0.0.0"
    port = int(str(os.getenv("WIZ_WEBHOOK_PORT", "8787")).strip() or "8787")
    server = ThreadingHTTPServer((host, port), WizWebhookHandler)
    print(f"Wizbot standalone listening on {host}:{port}", flush=True)
    # Iniciar agendador de cron em thread daemon
    scheduler_thread = threading.Thread(target=_scheduler_loop, daemon=True, name="cron-boletos")
    scheduler_thread.start()
    print("[cron-boletos] Agendador iniciado: regera boletos todo dia 5 do mes as 06:00.", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
