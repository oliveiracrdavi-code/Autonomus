/* Tutor de estudo: chat com modos, anexos de texto, microfone (voz para texto) e resposta em voz (texto para voz). */
(function () {
  const ui = window.OAB.ui;
  const { h } = ui;
  const store = window.OAB.store;
  const T = window.OAB.lib.tutor;
  const voice = () => window.OAB.voice;

  const KEY = 'oab-tutor-v1';
  const MAX_SAVED = 40;
  const MAX_ATTACH_BYTES = 200 * 1024;
  const VOICE_DEFAULT = 'Magpie-Multilingual.PT-BR.Isabela';

  // Estado da conversa (persistido no navegador do próprio usuário)
  const conv = {
    messages: [],
    mode: 'tutor',
    model: null,
    voice: VOICE_DEFAULT,
    useData: false,
    autoSpeak: false,
    attachments: [],
    busy: false,
    recording: null,
    player: null,
  };
  let serverStatus = null;

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && Array.isArray(saved.messages)) {
        conv.messages = saved.messages.filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')).slice(-MAX_SAVED);
        ['mode', 'model', 'voice', 'useData', 'autoSpeak'].forEach((k) => { if (saved[k] !== undefined) conv[k] = saved[k]; });
      }
    } catch (e) { /* armazenamento indisponível: segue só com a memória da aba */ }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ messages: conv.messages.slice(-MAX_SAVED), mode: conv.mode, model: conv.model, voice: conv.voice, useData: conv.useData, autoSpeak: conv.autoSpeak }));
    } catch (e) { /* ignora */ }
  }

  /** Lê um pedido vindo de outra tela (ex.: "explicar este erro") e aplica no chat. */
  function consumeSeed() {
    const seed = window.OAB.tutorSeed;
    if (!seed) return null;
    window.OAB.tutorSeed = null;
    if (seed.mode && T.MODES[seed.mode]) conv.mode = seed.mode;
    return seed;
  }

  function banner(kind, title, text, action) {
    return h('div', { class: `notice ${kind === 'off' ? 'warn' : kind === 'ok' ? 'ok' : ''}` },
      h('strong', null, title), text ? h('p', { class: 'small' }, text) : null, action || null);
  }

  function statusBanners() {
    if (!serverStatus) return h('div', { class: 'notice' }, 'Verificando o servidor…');
    if (serverStatus.offline) {
      return banner('off', 'Servidor do tutor não encontrado',
        'Para usar o tutor e a voz, rode “npm start” na pasta do projeto e abra http://localhost:8080. O restante do app funciona sem o servidor.');
    }
    const parts = [];
    if (!serverStatus.chat.available) parts.push(banner('off', 'Chave da NVIDIA não configurada', 'Defina NVIDIA_API_KEYS antes de iniciar o servidor (veja .env.example).'));
    if (serverStatus.chat.available && !serverStatus.voice.available) parts.push(banner('off', 'Voz indisponível', serverStatus.voice.reason || 'Instale as dependências com npm install.'));
    return h('div', { class: 'stack' }, parts);
  }

  /** Texto do usuário vai como texto puro; a resposta do modelo passa pelo Markdown seguro (escapado). */
  function renderBody(m, isUser) {
    const body = h('div', { class: `chat-text ${isUser ? '' : 'md'}` });
    if (isUser || m.error) body.textContent = m.content;
    else body.innerHTML = T.renderMarkdown(m.content);
    return body;
  }

  function messageView(m, i) {
    const isUser = m.role === 'user';
    return h('article', { class: `chat-msg ${isUser ? 'from-user' : 'from-bot'} ${m.error ? 'is-error' : ''}` },
      h('p', { class: 'chat-role' }, isUser ? 'Você' : 'Tutor'),
      renderBody(m, isUser),
      m.attachments && m.attachments.length ? h('p', { class: 'tiny muted' }, `Anexos: ${m.attachments.join(', ')}`) : null,
      !isUser && !m.error ? h('div', { class: 'chat-actions' },
        h('button', { class: 'btn sm ghost', type: 'button', onclick: () => speakMessage(m) }, '🔊 Ouvir'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(m.content); ui.toast('Resposta copiada.', 'ok'); } }, 'Copiar')) : null);
  }

  async function speakMessage(m) {
    if (!serverStatus || serverStatus.offline || !serverStatus.voice.available) return ui.toast('A voz precisa do servidor com a chave da NVIDIA.', 'warn');
    try {
      ui.toast('Gerando a voz…');
      if (conv.player) conv.player.stop();
      conv.player = await voice().speak(T.speechText(m.content), conv.voice);
    } catch (e) {
      ui.toast(`Não foi possível tocar a resposta: ${e.message}`, 'warn');
    }
  }

  async function send(seedText, seedAutoSpeak) {
    const composer = document.getElementById('tutor-input');
    const text = (seedText !== undefined ? seedText : (composer ? composer.value : '')).trim();
    if (conv.busy || (!text && conv.attachments.length === 0)) return;
    if (!serverStatus || serverStatus.offline || !serverStatus.chat.available) return ui.toast('O tutor precisa do servidor com a chave da NVIDIA.', 'warn');

    // mensagens de erro não entram no histórico enviado ao modelo: não são respostas dele
    const history = conv.messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    const attachments = conv.attachments.map((a) => T.prepareAttachment(a.name, a.text));
    const names = conv.attachments.map((a) => a.name);
    const context = conv.useData ? T.studentContext(store.getState(), Date.now()) : null;
    const messages = T.buildMessages({ mode: conv.mode, history, userText: text, context, attachments });

    conv.messages.push({ role: 'user', content: text || '(anexo)', attachments: names.length ? names : null });
    conv.attachments = [];
    if (composer) composer.value = '';
    conv.busy = true;
    update();
    try {
      const out = await voice().chat({ model: conv.model, messages });
      conv.messages.push({ role: 'assistant', content: out.reply, model: out.model });
      if (conv.autoSpeak || seedAutoSpeak) speakMessage(conv.messages[conv.messages.length - 1]);
    } catch (e) {
      conv.messages.push({ role: 'assistant', content: `Não consegui responder agora: ${e.message}. Tente outro modelo nas configurações do chat.`, error: true });
    } finally {
      conv.busy = false;
      save();
      update();
    }
  }

  async function toggleMic() {
    if (conv.recording) {
      conv.transcribing = true;
      update();
      try {
        const text = await conv.recording.stop();
        const composer = document.getElementById('tutor-input');
        if (text && composer) { composer.value = (composer.value ? `${composer.value} ` : '') + text; composer.focus(); }
        else ui.toast('Não ouvi nada. Tente de novo.', 'warn');
      } catch (e) {
        ui.toast(`Não foi possível transcrever: ${e.message}`, 'warn');
      } finally {
        conv.recording = null;
        conv.transcribing = false;
        update();
      }
      return;
    }
    if (!serverStatus || serverStatus.offline || !serverStatus.voice.available) return ui.toast('O microfone precisa do servidor com a voz ativa.', 'warn');
    try {
      conv.recording = await voice().record();
      ui.toast('Gravando. Clique de novo para parar (máximo de 2 minutos).', 'ok');
      update();
    } catch (e) {
      ui.toast(`Microfone indisponível: ${e.message}`, 'warn');
    }
  }

  async function attachFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_ATTACH_BYTES) return ui.toast('Arquivo acima de 200 KB. Use um trecho menor.', 'warn');
    if (!/\.(txt|md|csv|json)$/i.test(file.name)) return ui.toast('Por enquanto, anexe arquivos .txt, .md, .csv ou .json.', 'warn');
    conv.attachments.push({ name: file.name, text: await file.text() });
    update();
  }

  /* ---------- desenho ---------- */
  let list = null;
  let composerBox = null;
  let controls = null;

  function update() {
    if (!list) return;
    ui.clear(list);
    if (conv.messages.length === 0) {
      list.appendChild(ui.empty('Comece uma conversa', 'Pergunte sobre um artigo, peça uma questão no estilo da banca, ou escolha o modo Socrático para treinar o raciocínio.'));
    } else {
      conv.messages.forEach((m, i) => list.appendChild(messageView(m, i)));
    }
    if (conv.busy) list.appendChild(h('p', { class: 'chat-typing', role: 'status' }, 'O tutor está pensando…'));
    list.scrollTop = list.scrollHeight;
    if (controls) controls.refresh();
  }

  function modeTabs() {
    return ui.tabs(Object.values(T.MODES).map((m) => ({ id: m.id, label: m.label })), conv.mode, (id) => {
      conv.mode = id;
      save();
      update();
      window.OAB.app.refresh();
    });
  }

  /** Aplica um pedido de outra tela: envia direto ou só prepara o texto no campo. */
  function applySeed(seed) {
    if (seed.autoSend) send(seed.text, !!seed.autoSpeak);
    else { const el = document.getElementById('tutor-input'); if (el) { el.value = seed.text; el.focus(); } }
  }

  function view(params, ctx) {
    load();
    const seed = consumeSeed();
    let pendingSeed = null;
    // pedido de outra tela: só age depois que o status do servidor chega (antes disso o envio é recusado)
    if (seed && seed.text) {
      if (serverStatus) setTimeout(() => applySeed(seed), 0);
      else pendingSeed = seed;
    }

    list = h('div', { class: 'chat-list', 'aria-live': 'polite' });
    const input = ui.textarea({ id: 'tutor-input', rows: 3, placeholder: 'Pergunte ao tutor… (Enter envia, Shift+Enter quebra linha)', 'aria-label': 'Mensagem para o tutor' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

    const fileInput = h('input', { type: 'file', accept: '.txt,.md,.csv,.json,text/plain', hidden: true, 'aria-hidden': 'true', onchange: (e) => attachFile(e.target) });
    const micBtn = h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Falar com o tutor', onclick: () => toggleMic() }, '🎙 Falar');
    const sendBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => send() }, ui.icon('arrowUp'), 'Enviar');
    const attachBar = h('div', { class: 'attach-bar' });
    const refreshAttach = () => {
      ui.clear(attachBar);
      conv.attachments.forEach((a, i) => attachBar.appendChild(h('span', { class: 'attach-chip' }, a.name, h('button', { type: 'button', 'aria-label': `Remover ${a.name}`, onclick: () => { conv.attachments.splice(i, 1); update(); } }, '×'))));
    };

    composerBox = h('div', { class: 'composer' },
      attachBar, input,
      h('div', { class: 'composer-row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => fileInput.click() }, '📎 Anexo'),
        fileInput, micBtn,
        h('span', { class: 'grow' }),
        sendBtn));

    const refreshAll = () => { refreshAttach(); micBtn.textContent = conv.transcribing ? 'Transcrevendo…' : conv.recording ? '⏺ Parar' : '🎙 Falar'; micBtn.disabled = !!conv.transcribing; micBtn.classList.toggle('danger', !!conv.recording && !conv.transcribing); sendBtn.disabled = conv.busy; };
    controls = { refresh: refreshAll };

    const modelOpts = (serverStatus && serverStatus.chat.models || []).map((m) => ({ value: m.id, label: m.label }));
    const defaultModel = modelOpts.find((m) => m.value === conv.model) ? conv.model : (modelOpts[0] ? modelOpts[0].value : '');
    conv.model = defaultModel;
    const modelSel = ui.select({ 'aria-label': 'Modelo de IA', onchange: (e) => { conv.model = e.target.value; save(); } }, modelOpts.length ? modelOpts : [{ value: '', label: 'Indisponível' }], defaultModel);
    const voiceOpts = (serverStatus && serverStatus.voice.voices || []).map((v) => ({ value: v.id, label: `Voz ${v.label}` }));
    const voiceSel = ui.select({ 'aria-label': 'Voz do tutor', onchange: (e) => { conv.voice = e.target.value; save(); } }, voiceOpts.length ? voiceOpts : [{ value: VOICE_DEFAULT, label: 'Voz Isabela' }], conv.voice);

    const dataToggle = h('label', { class: 'check-row' },
      h('input', { type: 'checkbox', checked: conv.useData || null, onchange: (e) => { conv.useData = e.target.checked; save(); } }),
      h('span', null, 'Usar meus números no contexto (agregados, sem anotações)'));
    const autoToggle = h('label', { class: 'check-row' },
      h('input', { type: 'checkbox', checked: conv.autoSpeak || null, onchange: (e) => { conv.autoSpeak = e.target.checked; save(); } }),
      h('span', null, 'Ler as respostas em voz alta'));

    update();
    refreshAll();
    ctx.onLeave(() => { if (conv.recording) conv.recording.cancel(); conv.recording = null; if (conv.player) conv.player.stop(); });

    // carrega o status do servidor em segundo plano e redesenha
    if (!serverStatus) {
      window.OAB.voice.status().then((s) => {
        serverStatus = s;
        window.OAB.app.refresh();
        if (pendingSeed) { const waiting = pendingSeed; pendingSeed = null; setTimeout(() => applySeed(waiting), 0); }
      });
    }

    const chatCard = ui.card(null, h('div', { class: 'chat-wrap' }, list, composerBox), { cls: 'chat-card' });
    const side = ui.card('Configurações do tutor', h('div', { class: 'stack' },
      h('div', null, h('p', { class: 'eyebrow' }, 'Modo'), modeTabs()),
      h('div', null, h('p', { class: 'eyebrow' }, 'Modelo'), modelSel, h('p', { class: 'tiny muted' }, 'O padrão é o Nemotron 3 Ultra, o mais rápido e preciso nos testes.')),
      h('div', null, h('p', { class: 'eyebrow' }, 'Voz'), voiceSel, h('p', { class: 'tiny muted' }, 'Vozes Magpie em português do Brasil, da NVIDIA.')),
      dataToggle, autoToggle,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { conv.messages = []; conv.attachments = []; save(); update(); } }, 'Novo chat'),
      h('div', { class: 'notice warn' },
        h('strong', null, 'Privacidade'),
        h('p', { class: 'small' }, 'Mensagens, anexos e áudios são enviados à NVIDIA para gerar as respostas, e a NVIDIA pode registrá-los conforme os termos do serviço de teste. Não envie dados pessoais nem material sigiloso.')),
      h('div', { class: 'notice' },
        h('strong', null, 'Confira sempre a lei'),
        h('p', { class: 'small' }, 'A IA pode errar artigos e jurisprudência. Valide na fonte oficial antes de estudar um tema como verdade.'))),
      { cls: 'tutor-side' });

    return h('div', { class: 'page tutor-page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Inteligência'),
          h('h1', { class: 'display-sm' }, 'Tutor de estudo'),
          h('p', { class: 'muted' }, 'Pergunte, treine com a banca, ouça as respostas. O tutor pode usar seus números para personalizar.'))),
      statusBanners(),
      h('div', { class: 'tutor-grid' }, chatCard, side));
  }

  window.OAB.views.tutor = view;
})();
