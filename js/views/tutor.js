/* Tutor de estudo: só o chat. Mensagens do usuário vão como texto puro; respostas do modelo passam pelo Markdown seguro. */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const T = window.OAB.lib.tutor;

  const KEY = 'oab-tutor-v1';
  const MAX_SAVED = 40;

  // Estado da conversa (guardado só no navegador do próprio usuário)
  const conv = { messages: [], busy: false };
  let serverStatus = null;
  let list = null;
  let composer = null;
  let sendBtn = null;

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && Array.isArray(saved.messages)) {
        conv.messages = saved.messages
          .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
          .slice(-MAX_SAVED);
      }
    } catch (e) { /* armazenamento indisponível: segue só com a memória da aba */ }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ messages: conv.messages.slice(-MAX_SAVED) }));
    } catch (e) { /* ignora */ }
  }

  /** Modelo usado: o primeiro disponível no servidor (o padrão é o Kimi K3). */
  function modelId() {
    const models = (serverStatus && serverStatus.chat && serverStatus.chat.models) || [];
    return models.length ? models[0].id : '';
  }

  /** Pedido vindo de outra tela (ex.: "explicar este erro"): aplica quando o servidor já respondeu. */
  function consumeSeed() {
    const seed = window.OAB.tutorSeed;
    if (!seed) return null;
    window.OAB.tutorSeed = null;
    return seed;
  }

  /** O tutor pode receber pedido sozinho (botão "Explicar" e resumo): só se estiver pronto para responder agora. */
  function canSend() {
    return !!serverStatus && !serverStatus.offline && !!serverStatus.chat.available && !conv.busy;
  }

  /** Pedido de outra tela: o modo vale só para esta mensagem. Se não puder enviar agora, o texto fica no campo. */
  function applySeed(seed) {
    const mode = seed.mode && T.MODES[seed.mode] ? seed.mode : null;
    if (seed.autoSend && canSend()) { send(seed.text, mode); return; }
    if (composer) { composer.value = seed.text; composer.focus(); }
  }

  function banner(kind, title, text) {
    return h('div', { class: `notice ${kind === 'off' ? 'warn' : ''}` }, h('strong', null, title), text ? h('p', { class: 'small' }, text) : null);
  }

  function statusBanners() {
    if (!serverStatus) return h('div', { class: 'notice' }, 'Verificando o servidor…');
    if (serverStatus.offline) {
      return banner('off', 'Servidor do tutor não encontrado', 'Para usar o tutor, rode “npm start” na pasta do projeto e abra http://localhost:8080. O restante do app funciona sem o servidor.');
    }
    if (!serverStatus.chat.available) return banner('off', 'Chave da NVIDIA não configurada', 'Defina NVIDIA_API_KEYS antes de iniciar o servidor (veja .env.example).');
    return null;
  }

  function messageView(m) {
    const isUser = m.role === 'user';
    const body = h('div', { class: `chat-text ${isUser || m.error ? '' : 'md'}` });
    if (isUser || m.error) body.textContent = m.content;
    else body.innerHTML = T.renderMarkdown(m.content);
    return h('article', { class: `chat-msg ${isUser ? 'from-user' : 'from-bot'} ${m.error ? 'is-error' : ''}` },
      h('p', { class: 'chat-role' }, isUser ? 'Você' : 'Tutor'),
      body);
  }

  function update() {
    if (!list) return;
    ui.clear(list);
    if (conv.messages.length === 0) {
      list.appendChild(ui.empty('Comece uma conversa', 'Pergunte sobre um artigo, peça uma questão no estilo da banca ou peça para explicar um erro do caderno.'));
    } else {
      conv.messages.forEach((m) => list.appendChild(messageView(m)));
    }
    if (conv.busy) list.appendChild(h('p', { class: 'chat-typing', role: 'status' }, 'O tutor está pensando…'));
    list.scrollTop = list.scrollHeight;
    if (sendBtn) sendBtn.disabled = conv.busy;
  }

  async function send(seedText, mode) {
    const text = (seedText !== undefined ? seedText : (composer ? composer.value : '')).trim();
    if (conv.busy || !text) return;
    if (!serverStatus || serverStatus.offline || !serverStatus.chat.available) return ui.toast('O tutor precisa do servidor com a chave da NVIDIA.', 'warn');

    const history = conv.messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    const messages = T.buildMessages({ mode: mode || 'tutor', history, userText: text });

    conv.messages.push({ role: 'user', content: text });
    if (composer) composer.value = '';
    conv.busy = true;
    update();
    try {
      const out = await window.OAB.voice.chat({ model: modelId(), messages });
      conv.messages.push({ role: 'assistant', content: out.reply, model: out.model });
    } catch (e) {
      conv.messages.push({ role: 'assistant', content: `Não consegui responder agora: ${e.message}. Tente de novo em instantes.`, error: true });
    } finally {
      conv.busy = false;
      save();
      update();
    }
  }

  function view() {
    load();
    const seed = consumeSeed();
    let pendingSeed = null;

    list = h('div', { class: 'chat-list', 'aria-live': 'polite' });
    const input = ui.textarea({ id: 'tutor-input', rows: 3, placeholder: 'Pergunte ao tutor… (Enter envia, Shift+Enter quebra linha)', 'aria-label': 'Mensagem para o tutor' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    composer = input;
    sendBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => send() }, 'Enviar');

    update();
    if (!serverStatus) {
      window.OAB.voice.status().then((s) => {
        serverStatus = s;
        window.OAB.app.refresh();
        if (pendingSeed) { const waiting = pendingSeed; pendingSeed = null; setTimeout(() => applySeed(waiting), 0); }
      });
    }

    // pedido de outra tela: só age depois que o status do servidor chega (antes disso o envio é recusado)
    if (seed && seed.text) {
      if (serverStatus) setTimeout(() => applySeed(seed), 0);
      else pendingSeed = seed;
    }

    const notices = statusBanners();
    return h('div', { class: 'page tutor-page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Inteligência'),
          h('h1', { class: 'display-sm' }, 'Tutor de estudo'))),
      notices,
      h('div', { class: 'chat-card chat-only' },
        h('div', { class: 'chat-wrap' }, list),
        h('div', { class: 'composer' }, input, sendBtn),
        h('p', { class: 'tiny muted chat-foot' }, 'Mensagens são enviadas à NVIDIA. Não envie dados pessoais. A IA pode errar: confira a lei na fonte oficial.')));
  }

  window.OAB.views.tutor = view;
})();
