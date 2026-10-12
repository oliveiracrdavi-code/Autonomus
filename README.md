# OAB Estudos · plataforma de estudo para a 1ª fase

Sistema web, sem instalação e sem dependências de servidor, para organizar a preparação para a 1ª fase da OAB:
ciclo de estudos de duas horas por bloco, registro de questões, caderno de erros, flashcards com repetição espaçada,
revisão semanal, biblioteca de PDFs (Gran Curso e Estratégia), modo prova cronometrado, simulados com metas e relatório imprimível.

## Como usar

- **Abrir:** dê dois cliques em `index.html` ou sirva a pasta com `npm start` e acesse `http://localhost:8080`.
- **Dados:** ficam salvos neste navegador (`localStorage`). Os PDFs ficam no IndexedDB do navegador. Nada é enviado para servidores.
- **Backup:** em *Configurações → Exportar backup* (JSON). Os PDFs não entram no backup; em outro dispositivo, importe-os de novo.
- **Atalhos:** `Ctrl K` abre a paleta de comandos e a busca global. Na revisão de flashcards: `Espaço` mostra a regra, `L` (lembrei) e `E` (esqueci).

## Funções

| Área | O que faz |
|---|---|
| Painel | Próximo bloco, meta atual, meta de hoje, sequência, mapa de calor, nível e XP, trilha dos próximos 12 blocos, cobertura do edital, previsão do ciclo, gráficos e conquistas |
| Sessão | Cronômetro por fase (teoria e questões), pausa e retomada, recuperação após fechar o app, checklist de conclusão e modo foco |
| Ciclo | 30 blocos iniciais, arrastar e soltar, subir e descer, duplicar, remover, quantidade por matéria e próximo bloco |
| Questões | Registro por bloco ou individual, pré-visualização do aproveitamento, números de erradas e de chutes que viram itens do caderno |
| Caderno de erros | Erro e acerto por chute ou dúvida, status (pendente, revisado, recorrente), histórico de tentativas e erros que se repetem |
| Flashcards | Cada regra do caderno vira cartão no método de caixas (1, 2, 4, 7 e 15 dias) |
| Revisão semanal | Itens do período escolhido (semana, semana anterior, 7 dias ou período livre), sem conteúdo novo e sem alterar o ciclo |
| Materiais | Importação de PDFs, abertura dentro do app, página em que parou, pendências, status e associação ao bloco atual |
| Matérias | 23 disciplinas (editáveis), assuntos com prioridade e status, cobertura, PDFs, erros e sessões por matéria |
| Simulados | Comparação a cada duas semanas, metas editáveis e previsão linear a partir de 3 simulados |
| Modo prova | Simulado cronometrado com gabarito C/E/B, atalhos de teclado, colagem de gabarito e salvamento automático |
| Relatório | Versão limpa para imprimir ou salvar em PDF, e exportação CSV (questões, caderno e sessões) compatível com o Excel |

## Desenvolvimento

```bash
npm test          # testes da lógica (ciclo, cronômetro, estatísticas, validações, flashcards, prova, CSV)
npm start         # servidor estático em http://localhost:8080
```

Estrutura:

- `js/lib/` lógica pura, testável em Node (`cycle`, `session`, `stats`, `records`, `review`, `analytics`, `planner`, `flashcards`, `exporter`, `prova`), além de `store` (estado e persistência) e `seed` (dados iniciais)
- `js/ui/` componentes (`dom`, modais, formulários) e gráficos sem dependências (`charts`)
- `js/views/` telas, uma por arquivo
- `css/app.css` tema escuro cinematográfico, com tokens e regras de responsividade
- `tests/` testes unitários da lógica (`node --test`)
- `docs/auditoria/` auditoria de design: comparativos lado a lado com as referências do PDF e com o Tutory, checklist medido no navegador

## Limitações conhecidas

- Não há IA (assistente ou resumos automáticos). Ela exigiria um servidor e uma chave de API.
- Não há sincronização entre dispositivos; use o backup.
- O texto dos PDFs não é extraído; a busca cobre título, descrição e anotações.
- Os pesos informados das matérias somam 103%. O app avisa e aceita a edição.
- A data da OAB 47 é provisória (12/10/2026); ajuste em Simulados.
