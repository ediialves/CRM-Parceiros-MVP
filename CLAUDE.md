# CAPro — CRM de Parceiros

Contexto destilado de ~4 meses de desenvolvimento (originalmente construído via Gemini/Google
AI Studio, com histórico de decisões mantido num Claude Project separado). Este arquivo existe
para que qualquer sessão futura (Claude Code ou não) tenha o "porquê" por trás do código sem
precisar reconstruir esse histórico do zero. Atualize-o quando uma decisão não-óbvia for tomada,
um bug relevante for encontrado/corrigido, ou algo planejado for implementado.

## Como este projeto é publicado (importante!)

- **Código-fonte**: este repositório GitHub (`ediialves/CRM-Parceiros-MVP`).
- **App em produção**: `https://parceiros-crm-v0-1097859049755.us-west1.run.app` — um serviço
  **Google Cloud Run**, publicado a partir do Google AI Studio (botão de publicar), **não**
  automaticamente a partir deste repositório.
- **Sincronização AI Studio ↔ GitHub**: o AI Studio consegue puxar e empurrar commits para este
  repo sob demanda (não é contínuo/automático — só quando alguém aciona pelo AI Studio). Não há
  GitHub Actions, webhook ou qualquer outro CI/CD configurado aqui.
- **Consequência prática**: um `git push` para `main` **não** publica nada sozinho. Alguém
  precisa publicar de novo via AI Studio para o Cloud Run pegar as mudanças. E como o AI Studio
  também pode escrever no `main` a qualquer momento, sempre dar `git pull --rebase` antes de
  começar a trabalhar, para não perder mudanças feitas em paralelo por lá.

## 1. Glossário de negócio

- **Parceiro**: escritório de contabilidade (accounting firm) gerenciado por um gerente no CRM; identificado unicamente por `accountancy_id`.
- **Gerente**: account manager responsável por uma carteira de parceiros (37 gerentes reais na base atual).
- **Camisa 10**: um dos responsáveis possíveis por uma task (ao lado de gerente e parceiro), conforme a documentação original do produto.
- **Fila**: classificação do parceiro em `RETENÇÃO` ou `EXPANSÃO`. Regra de origem (planilha): coluna de segmentação > 5 = RETENÇÃO; ≤ 5 ou "sem estoque" = EXPANSÃO.
- **Segmentação (S1/S2)**: badge de estoque do parceiro — S1 "Estoque Alto" (amarelo) vs S2 "Estoque Baixo" (cinza).
- **Safra / Coorte**: agrupamento de planos pela semana em que foram criados, usado nas tabelas de cohort do Dashboard Gerencial V2 (semanas S0, S1, S2... Smax). Critério exato: segunda-feira da semana de `plans.created_at` — ver `getMondayOfWeek()` em `DashboardGerencialV2.tsx`.
- **S0 / Sn**: ponto de entrada da safra (S0) e semanas subsequentes (Sn) nas tabelas de coorte; S0 é calculado pelo snapshot mais recente dentro da semana cheia (segunda a domingo) de entrada.
- **Coorte de Engajamento — Base Fixa**: 6ª tabela de coorte; usa como denominador o total de licenças no S0 (travado, nunca recalculado), eliminando distorção de % quando o parceiro ganha/perde licença desengajada sem mudança real de engajamento.
- **"Parado" (kanban de planos)**: plano sem nenhuma movimentação em `task_status_history` há 15+ dias (não é sobre % de progresso).
- **"Planos parados 45+d" (radar de risco)**: mesmo conceito de "parado", mas com limiar de 45 dias, aplicado a qualquer plano ativo (manual ou automático).
- **Playbook automático**: sequência padronizada de tasks (`playbook_tasks`) aplicável em massa a vários parceiros, gerando `plans` com `playbook_id` preenchido. Plano "manual" é o que não tem `playbook_id`.
- **"Finalizado" (plano)**: definição vigente = `ativo = false OU todas as tasks concluídas` (substituiu a definição antiga que só considerava conclusão de tasks).
- **`status_conclusao`**: classificação do encerramento de um plano — Sucesso / Sem Sucesso / Não Classificado. Obrigatório preencher ao concluir a última task do plano.
- **`motivo_insucesso`**: motivo padronizado (9 opções fixas, ex. "Sem resposta", "Churn total do parceiro") exigido quando o plano é encerrado sem sucesso.
- **Kanban de campanha**: 6 colunas fixas — Não Abordado, Abordado, Reunião Marcada, Proposta Apresentada, Converteu, Perdeu.
- **"Converteu" (campanha)**: exige informar `licencas_convertidas` (mínimo 1) — significa que licenças foram vendidas.
- **"Perdeu" (campanha)**: exige `motivo_perda` com mínimo 75 caracteres (depois padronizado com `motivo_perda_padrao`, 9 opções fixas extraídas de comentários reais do `campaign_timeline`).
- **Backfill retroativo de fase (campanha)**: ao mover um card pulando fases, o sistema preenche `now()` em todos os campos `entrou_X_em` das fases anteriores ainda nulas.
- **`import_completo`**: flag booleana em `partner_snapshots` que marca se um snapshot veio de importação real e completa (vs. reparo retroativo parcial) — usada para não distorcer o gráfico "Histórico de Licenças e Engajamento".
- **DB segmentado**: nome da aba única da planilha Excel que o sistema lê na importação; todas as outras abas são ignoradas mesmo que a planilha completa seja enviada.

## 2. Regras de negócio não óbvias (com o "porquê")

- **Queda de engajamento (radar de risco)**: entra no radar qualquer parceiro com queda ≥ 3 pontos percentuais no `percentual_engajamento` nos últimos 30 dias, comparando o snapshot atual com o snapshot mais próximo de 30 dias atrás (não o snapshot imediatamente anterior). Threshold mudou de 5pp para 3pp por decisão explícita do usuário na Fase 8.
- **"Expansão sem plano" substituiu "Retenção sem plano" no radar**: critério = `fila = 'EXPANSÃO'` sem plano ativo (mesma lógica de retenção, só trocando a fila). Motivo: retenção sem plano deixou de ser prioridade de exibição nessa tela; expansão sem plano identifica parceiros prontos/semi-prontos para comprar de novo.
- **Múltiplos planos ativos simultâneos permitidos**: decisão de arquitetura que contraria a documentação original do produto ("apenas 1 plano ativo simultaneamente") — na prática o sistema permite **1 plano manual + N planos gerados por playbook** ativos ao mesmo tempo por parceiro. O progresso exibido no `PartnerCard` é agregado entre todos os planos ativos.
- **Kanban "Planos e playbooks consolidados"**: originalmente só incluía planos com `playbook_id IS NOT NULL` (planos automáticos). Foi expandido para incluir todos os planos (manuais + automáticos) com limiar único de 15 dias para "Parado" — decisão tomada porque os 23 planos manuais "parados" de uma gerente não apareciam em lugar nenhum antes dos 45 dias do card de risco.
- **`percentual_engajamento` sempre normalizado para inteiro 0–100**: a coluna de origem na planilha chega em formatos mistos (decimal `0.29`, string `"100%"`, ou nulo) e precisa ser normalizada na importação.
- **`gerente_id` nunca é sobrescrito por importação**: o parser de importação não deve enviar `gerente_id` no UPSERT de parceiros — o vínculo gerente↔parceiro já existe no banco e a planilha não deve sobrescrevê-lo.
- **`partners.gerente` (texto) é sempre usado no lugar de join com `users`**: joins com `users` para achar o nome do gerente causam o bug recorrente "Sem gerente" quando o nome no texto não bate exatamente com `users.nome` (variações de nome truncado, ex. "Carolina Ramos" vs "Carolina Guedert Ramos"). A normalização `lower(unaccent(trim()))` resolve diferenças de acentuação/caixa, mas não resolve nomes truncados/incompletos — isso exige mapeamento manual.
- **Datas de importação: agrupar por `imported_at::date`**: uma única importação grava em múltiplos lotes com timestamps ligeiramente diferentes (`.042`, `.043`...), o que gera múltiplos pontos no mesmo dia nos gráficos se não for agrupado por dia.
- **Limite de 1.000 registros do PostgREST**: não é um limite do Postgres, é da camada HTTP do Supabase (`pgrst.db_max_rows`, padrão 1000). Precisa ser alterado via `ALTER ROLE authenticator SET pgrst.db_max_rows = N` + `NOTIFY pgrst, 'reload config'`, OU pelo Supabase Dashboard → Settings → API → Max Rows. Setar `.limit()` no cliente não resolve porque o limite do servidor sobrepõe o do cliente. **Mitigação já implementada em `DashboardGerencialV2.tsx`**: `fetchAllPartners`/`fetchAllBasePlans`/`fetchAllTasks` paginam em lotes de 1000 via `.range()` em loop até a página vir incompleta — ver seção 4 para o porquê disso importar.
- **Coorte de Engajamento — Base Fixa: S0 mostra o valor real de entrada** (não o `100` neutro usado nas outras tabelas de cohort), porque nessa tabela o próprio S0 já representa o marco zero em termos percentuais absolutos, não relativos.
- **Heatmap das tabelas de coorte usa escala branco→verde escuro com domínio dinâmico**: a cor de cada célula é normalizada pelo min/max **real** dos valores exibidos naquela tabela específica (não um range fixo 0–100) — necessário porque os valores reais ficam concentrados numa faixa estreita (ex. 60–95%), e uma escala fixa fazia quase tudo virar a mesma cor. `getCohortHeatmapStyle(val, domain)` e `getCohortBaseFixaHeatmapStyle` (que só encaminha para a primeira) compartilham essa lógica — evitar reimplementar uma terceira versão.

## 3. Decisões de arquitetura e o motivo

- **Fluxo Claude → SQL manual → Gemini → resumo → aprovação**: adotado desde o início para eliminar risco de escrita indevida no banco e de escopo mal definido, dado que o Gemini tende a extrapolar escopo, hallucinate nomes de coluna e executar código antes de resumir. (Ver seção 4 — pelo menos um caso confirmado de o Gemini reportar em prosa algo que não existe no código.)
- **`plans.playbook_id` (FK real) substituiu a ligação por texto**: antes, a única ligação entre um plano e o playbook que o gerou era o texto (`plans.titulo` = nome do playbook), o que quebrava se o playbook fosse renomeado ou dois tivessem nomes parecidos. Foi adicionada uma FK `plans.playbook_id UUID REFERENCES playbooks(id)`, nullable (planos manuais continuam sem playbook_id).
- **Status do parceiro dentro de um playbook é derivado, não armazenado**: diferente da campanha (que tem status manual via drag-and-drop), o "Não iniciado / Em andamento / Concluído" de um parceiro dentro de um playbook é calculado em memória a partir do status das tasks do plano (`backlog` = não iniciado; alguma concluída ou em andamento = em andamento; todas concluídas = concluído) — sem tabela de timeline adicional como a campanha tem.
- **`playbook_funnel_snapshots` + cron foi descontinuado e substituído por `playbook_funnel_partner_snapshots`**: a tabela antiga (nível agregado, cron semanal) foi trocada por uma granular por parceiro/semana, capturando `origem_playbook` ('novo'/'bau'), `tem_plano_criado`, `tem_plano_finalizado`, para permitir resposta em tempo real aos filtros globais (Plano/Segmento, Gerente, Origem do Playbook).
- **`partners.plano` renomeada para `partners.segmento`**: mudança de nome de coluna no banco, mantendo o label de UI "Plano" para os usuários — exigiu atualização coordenada em ~10 arquivos do frontend.
- **Contexto/Resultado em texto livre nos planos**: dois campos opcionais (`contexto`, `resultado`) adicionados a `plans` para registrar por que o parceiro está numa situação e o que aconteceu na execução — decisão para dar histórico qualitativo sem estrutura rígida.
- **Drag-and-drop via `@dnd-kit/core`**: escolhido depois que um controle por `<select>` foi rejeitado como visualmente inadequado para o Kanban de campanha (depois reaproveitado no restante do sistema).
- **`SalesforceLinkButton` como componente reutilizável único**: em vez de reimplementar o link em cada tela, um componente único foi integrado em 5 pontos (`PartnerCard`, `CampanhaKanban`, `PlaybookKanbanModal`, `PartnerHeader`, tela de detalhe do parceiro) — decisão de reuso para manter consistência visual (ícone Cloud lucide-react, azul `#00A1E0`).
- **`PartnerHistoryChart` migrado de `partner_snapshots` para `import_logs`**: `partner_snapshots` filtrado por `import_completo = true` estava produzindo gráfico achatado (só 4 pontos, valores idênticos); a fonte foi trocada para `import_logs`, removendo o filtro de completude, para ter dado histórico real.

## 4. Bugs e limitações conhecidos

- ~~**Possível bug crítico nas tabelas de coorte (`filteredPartners.slice(0, 7)`)**~~ — **investigado e não confirmado** (Claude Code, 2026-08-25). O Gemini reportou esse suspeita em prosa, sem apontar um trecho de código real. Busquei em todo o repositório por `.slice(0,` e `.limit(` e revisei como `partners`/`plans`/`tasks` são buscados em `DashboardGerencialV2.tsx`: o fetch é paginado corretamente (`fetchAllPartners`/`fetchAllBasePlans`/`fetchAllTasks`, loop de `.range()` em lotes de 1000 até a página vir incompleta) e a lógica de agrupamento de safra (`getMondayOfWeek` + loop de `planEntries`) não descarta nem trunca nenhum parceiro por posição/quantidade. Se o sintoma que motivou essa suspeita ainda aparecer, o problema provavelmente está em outro lugar (dado de origem, filtro aplicado, ou um `partner_id` que não bate) — não é um corte de "primeiros N registros".
- **Divergência de `licencas_engajadas` entre `partners` (operacional) e snapshots corrigidos**: após correção de um import de 21/08 que subiu sem `percentual_engajamento`/`licencas_engajadas`, ficaram 191 parceiros com `licencas_engajadas` nulo/zero na tabela `partners`, somando 42.201 contra o valor corrigido de 40.535 nos snapshots — ação de reconciliação ainda pendente.
- **`import_logs`**: schema (colunas exatas) ainda não confirmado via SQL no momento em que `PartnerHistoryChart.tsx` estava sendo migrado para essa fonte — bloqueava a conclusão do gráfico dividido em dois (contagem em cima, engajamento % embaixo).
- **Fase 8 do Meu Dashboard**: pendente — mover "Qualidade da carteira", "Origem dos planos" e "Campanhas ativas" para o rodapé como widgets secundários menores (os 4 KPIs do topo e a divisão "Progresso Médio" removido / "Qualidade dos Planos" mantida já foram decididos).
- **Mapeamento retroativo de playbook para 16 parceiros**: incompleto — faltam decisões do usuário sobre parceiros sem tasks de evento no banco (só contexto textual), mapeamentos ambíguos de task→etapa, e confirmação de uma task já concluída como "Executar evento".
- **Gemini session corruption em arquivos grandes** (ex. `MeuDashboard.tsx` ~700 linhas): causa erros internos/loops ao ler o arquivo em fragmentos; mitigação é sessão nova + prompt autocontido, retry uma vez antes de quebrar em prompts menores. (Não é uma limitação do Claude Code — não replicar essa mitigação por padrão aqui.)

## 5. Coisas planejadas mas não implementadas

- **Licenças/estoque cobertos por playbook**: ideia pausada para pivotar para as tabelas de coorte; nunca desenhado como aparecerá no Analytics de Playbooks.
- **Funil por playbook, tempo médio por etapa, parceiros "parados", ranking de gerente**: sugestões de enriquecimento do Analytics de Playbooks levantadas, nenhuma avançou.
- **Analytics de Campanhas espelhando o de Playbooks**: mencionado como ideia, nunca desenhado.
- **Paginação real (em vez de aumentar `Max Rows`)** para contornar o limite de registros do Supabase — tratado como dívida de Fase 2, resolvido paliativamente subindo o limite (`pgrst.db_max_rows`) e com os loops de `.range()` descritos na seção 2/4.
- **Extração do bloco de kanban para componente próprio** (`src/components/PlanosPlaybooksKanban.tsx`), para reduzir o tamanho de `MeuDashboard.tsx` e a instabilidade de edição associada — ficou pendente ao fim da conversa da Fase 7/8.
- Escopo permanentemente fora (confirmado, não é "esquecido"): notificações, automações complexas, comentários, anexos, subtasks, integrações externas, IA dentro da aplicação, exportação e analytics gráficos avançados (Fase 2), gestão de usuários via UI (Fase 2).

## 6. Decisões que foram tomadas e depois revertidas ou mudadas

- **Kanban do Meu Dashboard**: começou restrito a planos com `playbook_id IS NOT NULL` (só automáticos) → depois expandido para incluir todos os planos (manuais + automáticos), com renomeação da seção de "Playbooks automáticos — consolidado" para "Planos e playbooks consolidados".
- **Definição de "Parado" no kanban**: chegou a ser cogitada como baseada em % de progresso, mas foi corrigida para ser baseada em ausência de movimentação em `task_status_history` por 15+ dias (com `plan.created_at` como fallback só quando não há histórico).
- **Threshold de queda de engajamento**: de 5 pontos percentuais para 3 pontos percentuais.
- **Card de risco "Retenção sem plano"**: existia desde a v1 do redesign do Meu Dashboard → removido do radar e do feed "O que fazer agora", substituído por "Expansão sem plano".
- **Definição de "Finalizado" (plano)**: antes considerava só conclusão de tasks → redefinida para `ativo = false OR todas as tasks concluídas`, aplicada retroativamente em cohorts, dashboards e no Kanban.
- **Fonte de dados do `PartnerHistoryChart`**: começou em `partner_snapshots` (com filtro `import_completo = true`) → trocada para `import_logs` sem filtro de completude, por o gráfico anterior mostrar dados achatados/incompletos. O gráfico também foi redesenhado de um gráfico único com eixo Y duplo para dois gráficos separados (contagem / engajamento %).
- **`playbook_funnel_snapshots`**: tabela e cron job originais foram descontinuados (cron desagendado, tabela mantida intacta mas não usada) em favor de `playbook_funnel_partner_snapshots`, granular por parceiro.
- **`partners.plano` → `partners.segmento`**: renomeação de coluna que exigiu atualização coordenada de ~10 arquivos, mantendo o rótulo "Plano" na UI.
- **Retroativos de `partner_snapshots`**: em vez de inserir só o dado corrigido isolado, houve reconstrução histórica de 597+ snapshots retroativos a partir de planilhas antigas — decisão de recriar histórico (INSERT, nunca UPDATE de snapshot existente) para respeitar o princípio "histórico nunca sobrescreve dados", exceto no caso pontual do import de 21/08 (sem dado de engajamento), onde foi feito um UPDATE direto por decisão explícita do usuário, abrindo exceção à regra de imutabilidade.
- **Heatmap das tabelas de coorte**: esquema vermelho→laranja→amarelo→verde (por faixas fixas de %) → branco→verde escuro linear → branco→verde escuro com domínio dinâmico pelo range real dos dados (ver seção 2). Cada mudança foi pedida porque a anterior não dava contraste/legibilidade suficiente.
