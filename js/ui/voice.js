/* Voz no navegador: gravação do microfone, conversão para PCM 16 kHz mono (formato do reconhecimento da NVIDIA)
 * e reprodução das respostas em voz. Fala só com o servidor local (/api/*), nunca com a NVIDIA diretamente. */
(function () {
  const MAX_RECORD_MS = 120000;

  /** Chamada à API local. Lança Error com a mensagem do servidor quando houver. */
  async function api(path, body, { raw, headers } = {}) {
    const res = await fetch(path, {
      method: 'POST',
      headers: raw ? headers : { 'Content-Type': 'application/json', ...(headers || {}) },
      body: raw ? body : JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `Erro ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch (e) { /* resposta não é JSON */ }
      throw Object.assign(new Error(msg), { status: res.status });
    }
    return res;
  }

  /** Status do servidor (chave configurada, modelos e vozes). Resolve offline=true se o servidor não responde. */
  async function status() {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      return { offline: false, ...(await res.json()) };
    } catch (e) {
      return { offline: true, chat: { available: false, models: [] }, voice: { available: false, voices: [] } };
    }
  }

  /** Converte um Float32 (-1..1) em Int16 little-endian. */
  function floatToPcm16(samples) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  /** Decodifica o áudio gravado (webm/opus, ogg etc.) e reamostra para 16 kHz mono. */
  async function toPcm16k(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ sampleRate: 16000 });
    try {
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      return floatToPcm16(buf.getChannelData(0));
    } finally {
      ctx.close();
    }
  }

  /**
   * Começa a gravar. Devolve { stop(): Promise<string> } com o texto transcrito, ou { cancel() }.
   * Para automaticamente após 2 minutos para manter o envio pequeno.
   */
  async function record() {
    if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error('Este navegador não permite gravar áudio.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) chunks.push(e.data); });
    const stopped = new Promise((resolve) => rec.addEventListener('stop', resolve, { once: true }));
    rec.start(250);
    const timer = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, MAX_RECORD_MS);
    const release = () => { clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()); };
    return {
      async stop() {
        if (rec.state !== 'inactive') rec.stop();
        await stopped;
        release();
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 2000) return '';
        const pcm = await toPcm16k(blob);
        const res = await api('/api/asr', pcm.buffer, { raw: true, headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': '16000' } });
        return (await res.json()).text || '';
      },
      cancel() {
        if (rec.state !== 'inactive') rec.stop();
        release();
      },
    };
  }

  let current = null;
  /** Lê um texto em voz. Interrompe a fala anterior, se houver. Devolve { stop() }. */
  async function speak(text, voiceId) {
    if (current) current.pause();
    const res = await api('/api/tts', { text, voice: voiceId });
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    current = audio;
    audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
    await audio.play();
    return { stop() { audio.pause(); URL.revokeObjectURL(url); if (current === audio) current = null; } };
  }

  /** Envia a conversa ao modelo. Devolve { reply, model }. */
  async function chat({ model, messages }) {
    const res = await api('/api/chat', { model, messages, maxTokens: 900 });
    return res.json();
  }

  window.OAB.voice = { status, record, speak, chat, floatToPcm16, MAX_RECORD_MS };
})();
