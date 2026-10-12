# OAB Estudos · plataforma de estudo para a 1ª fase

Plataforma web para organizar a preparação para a 1ª fase da OAB, com ciclo de estudos em blocos de 2 horas, registro de questões,
caderno de erros, flashcards com repetição espaçada, modo prova cronometrado, simulados, materiais em PDF e um **tutor com IA e voz**
(modelos da NVIDIA).

O app funciona sem servidor (abra `index.html`). O tutor e a voz precisam do servidor local (`npm start`) e de uma chave da NVIDIA.

## Como rodar

```bash
npm install                      # dependências da voz (gRPC)
export NVIDIA_API_KEYS="nvapi-..."   # uma ou mais chaves, separadas por vírgula
npm start                        # http://127.0.0.1:8080
```

- Sem `NVIDIA_API_KEYS`, o app inteiro funciona; só o tutor e a voz ficam indisponíveis, com um aviso na tela.
- Você pode guardar as variáveis num arquivo `.env` (copie `.env.example`). O `.env` está no `.gitignore` e **nunca deve ir para o git**.
- Se você colou uma chave em algum chat ou lugar público, **revogue e gere outra** no painel da NVIDIA.
- O servidor escuta só em `127.0.0.1` por padrão. Para outro endereço, defina `HOST`.
- Proteções locais: o servidor recusa cabeçalhos `Host` que não sejam o endereço local (evita que outro site use o servidor por DNS rebinding) e só aceita corpos de API em JSON ou PCM, que um formulário de outro site não consegue enviar. Qualquer texto de erro passa por uma remoção de chaves antes de sair.

## Chaves e privacidade

- As chaves ficam **só no servidor**, em variáveis de ambiente. O navegador nunca as recebe, e as respostas da API não as incluem.
- Mensagens, anexos de texto e áudios vão para a NVIDIA para gerar respostas e transcrições. Na própria página de teste dos modelos, a NVIDIA informa que
  entradas e saídas podem ser registradas para melhoria de produtos, conforme os termos de uso de teste. **Não envie dados pessoais nem material sigiloso.**
- O modo "Usar meus números" envia só agregados (totais, percentuais e nomes de disciplinas), nunca as suas anotações.
- Os PDFs e o histórico ficam no navegador. O áudio gravado não é guardado: vai para transcrição e é descartado.

## Modelos e voz (testados nesta conta)

| Uso | Modelo | Situação |
|---|---|---|
| Tutor (padrão) | `nvidia/nemotron-3-ultra-550b-a55b` | respondeu em ~3 s, resposta correta em português |
| Tutor | `nvidia/nemotron-3-super-120b-a12b` | respondeu em ~5 s |
| Tutor | `moonshotai/kimi-k3` | respondeu em ~24 s |
| Tutor | `deepseek-ai/deepseek-v4.1-flash` | **sem resposta** nos testes desta conta (timeout); fica na lista, mas pode estar indisponível |
| Voz (síntese) | Magpie Multilingual, vozes `PT-BR.Isabela`, `PT-BR.Louise`, `PT-BR.Diego` | áudio em português, validado por ida e volta |
| Voz (transcrição) | Parakeet TDT 0.6B multilíngue (25 idiomas, inclui português) | transcrição validada: o texto sintetizado voltou quase idêntico |

A voz usa gRPC em `grpc.nvcf.nvidia.com:443`, com um `function-id` por modelo. Os IDs padrão estão em `server/voice.js` e podem ser trocados por variáveis de ambiente.
A síntese divide o texto em trechos curtos e se recupera de falhas pontuais do modelo (normalização e divisão do trecho), pulando apenas o que não puder ser lido.

**Sobre "voz totalmente humana":** a qualidade é a do Magpie, um modelo de voz expressivo da NVIDIA. Não há como medir realismo por teste automático,
e a avaliação final é de quem ouve. O Magpie tem variações de emoção para inglês e outros idiomas, mas para português as vozes disponíveis são as três citadas acima.

## Funções

| Área | O que faz |
|---|---|
| Painel | Próximo bloco, meta atual, meta de hoje (com piso sugerido), sequência, mapa de calor, nível e XP, trilha dos próximos 12 blocos com alerta de bloqueio, cobertura do edital, previsão do ciclo, matriz de certeza, revisão de hoje e gráficos |
| Sessão | Cronômetro por fase, pausa e retomada, recuperação após fechar o app, checklist de conclusão e modo foco |
| Ciclo | 30 blocos iniciais, arrastar e soltar, quantidade por matéria e próximo bloco |
| Questões | Registro por bloco ou individual. Na individual, o nível de certeza (certeza, dúvida ou chute) alimenta a matriz de certeza |
| Caderno de erros | Erros e acertos por chute ou dúvida, status, histórico de tentativas, erros que se repetem e botão **Explicar com o tutor** |
| Flashcards | Cada regra do caderno vira cartão no método de caixas (1, 2, 4, 7 e 15 dias) |
| Revisão semanal | Itens do período escolhido, sem conteúdo novo e sem alterar o ciclo. Botão **Ouvir resumo da semana** |
| Tutor de estudo | Chat com modos Tutor, Socrático, Chefe de banca, Feynman (explique em voz) e Resumo em áudio. Anexos de texto, microfone (voz para texto), respostas em voz e Markdown seguro |
| Materiais | Importação de PDFs, abertura dentro do app, página em que parou, pendências e associação ao bloco atual |
| Matérias | 23 disciplinas (editáveis), assuntos com prioridade e status, cobertura, PDFs, erros e sessões por matéria |
| Simulados | Comparação a cada duas semanas, metas editáveis e previsão a partir de 3 simulados |
| Modo prova | Simulado cronometrado com gabarito C/E/B, atalhos de teclado, colagem de gabarito e rascunho salvo |
| Relatório | Versão para imprimir ou salvar em PDF, e exportação CSV (questões, caderno e sessões) |
| Busca | Ctrl+K: comandos, disciplinas, assuntos, materiais, itens do caderno e registros |

## Desenvolvimento

```bash
npm test     # 102 testes unitários (lógica, servidor, rotação de chaves, Markdown seguro, tutor)
```

- `js/lib/` lógica pura, testável em Node: ciclo, sessão, estatísticas, validações, revisão, flashcards, prova, análises, planejamento, exportação e tutor.
- `js/ui/` componentes, gráficos e voz no navegador (`voice.js`: gravação, conversão para PCM 16 kHz e reprodução).
- `js/views/` telas, uma por arquivo.
- `server/` servidor local: `server.js` (site e rotas `/api/status`, `/api/chat`, `/api/tts`, `/api/asr`), `nvidia.js` (chat, rotação de chaves e lista de modelos), `voice.js` (gRPC para voz), `keys.js`, `wav.js`, `text.js` e `proto/` (protos do Riva).
- `css/app.css` tema escuro cinematográfico.
- `docs/auditoria/` auditoria de design: comparativos com as referências do PDF e com o Tutory.

## Limitações conhecidas

- A IA pode errar artigos e jurisprudência. Confira sempre na lei vigente e na fonte oficial. O app avisa isso no tutor.
- O DeepSeek V4.1 Flash não respondeu nos testes desta conta. Se ele voltar a responder, basta escolhê-lo no seletor de modelos.
- Não há sincronização entre dispositivos. Use o backup em Configurações. Os PDFs precisam ser importados de novo em outro aparelho.
- O texto dos PDFs não é extraído; a busca cobre título, descrição e anotações.
- Os pesos informados das matérias somam 103%. O app avisa e aceita a edição.
- A data da OAB 47 é provisória (12/10/2026) e pode ser ajustada em Simulados.
- O servidor de voz e tutor é local e não tem autenticação: não exponha `HOST` para a internet sem uma camada de acesso na frente.
