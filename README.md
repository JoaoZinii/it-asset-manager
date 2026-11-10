<div align="center">

# IT Asset Manager

**Gestão de ativos de TI: equipamentos, colaboradores, entregas, manutenção e desligamentos, com auditoria automática.**

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

</div>

Plataforma web para o controle do parque de notebooks e desktops de uma empresa: quem está com cada equipamento, o histórico de entregas e devoluções, o que está em manutenção, quem está saindo da empresa e onde os dados estão inconsistentes. Toda a interface é em português do Brasil e os dados de exemplo são **100% fictícios**.

## Sumário

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Começando](#começando)
- [Dados de demonstração](#dados-de-demonstração)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como funciona](#como-funciona)
- [API](#api)
- [Banco de dados](#banco-de-dados)
- [Conversor de planilhas](#conversor-de-planilhas-tools)
- [Testes manuais](#testes-manuais)
- [Segurança e privacidade](#segurança-e-privacidade)
- [Para estudar SQL](#para-estudar-sql)

## Funcionalidades

- **Dashboard:** KPIs com contagem animada, gráficos de status, marca e evolução mensal, e lista de alertas.
- **Equipamentos:** cards ou tabela, filtros por status, tipo, site e marca, edição, histórico em linha do tempo e busca por patrimônio, Service Tag, etiqueta, hostname, modelo ou responsável.
- **Modelos e fotos:** a foto cadastrada uma vez para um modelo vale automaticamente para todos os equipamentos daquele modelo.
- **Colaboradores:** RA, e-mail, cargo, departamento, site, vínculo e situação (ativo, em desligamento ou inativo).
- **Movimentações:** entrega e devolução com controle transacional, busca e **termo de responsabilidade em PDF**.
- **Manutenção:** registro de motivo, fornecedor, nº do chamado e dias parado.
- **Desligamentos:** acompanhamento da devolução dos equipamentos de quem está saindo.
- **Auditoria automática:** desligados com equipamento, colaboradores sem notebook, equipamentos "entregues" sem responsável, responsáveis sem status "entregue" e notebooks realmente disponíveis.
- **Importar / Exportar CSV:** importação em lote com simulação prévia, sincronização de colaboradores com dados do AD e exportações abertas direto no Excel.
- **Modo claro e escuro**, interface responsiva.
- **Dois modos de backend** com a mesma API: dados em memória (demo, sem banco) e PostgreSQL.

## Stack

| Camada | Tecnologias |
|---|---|
| Frontend | React 18, Vite, React Router, Recharts, lucide-react, CSS puro |
| Backend | Node.js (ESM), Express 5, Zod, helmet, cors, dotenv, pdfkit, csv-parse |
| Banco | PostgreSQL 16 (Docker Compose), queries parametrizadas |

Arquitetura em camadas: `routes -> services -> banco`. Os dois modos usam as mesmas rotas, então o contrato da API é idêntico.

## Começando

**Pré-requisitos:** Node.js 20+ e npm. Docker apenas para o modo com banco.

### Modo demo (sem banco)

```bash
# terminal 1
cd backend && npm install && npm run demo
# terminal 2
cd frontend && npm install && npm run dev
```

Abra http://localhost:5173. Os dados ficam em memória: reiniciar o servidor restaura o seed.

### Modo com PostgreSQL

```bash
cp .env.example .env          # edite POSTGRES_PASSWORD
docker compose up -d          # cria o banco e carrega schema + seed
# terminal 1
cd backend && npm install && npm run dev
# terminal 2
cd frontend && npm install && npm run dev
```

- Recriar o banco do zero (apaga os dados): `docker compose down -v && docker compose up -d`
- Consultar com SQL: `docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB>`
- Para começar sem os dados fictícios, comente a linha do `seed.sql` no `docker-compose.yml` antes de criar o banco.

### Variáveis de ambiente

| Variável | Padrão | Para que serve |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | (obrigatórias) | Credenciais do banco, usadas pelo Docker e pela API |
| `POSTGRES_PORT` | `5432` | Porta do banco no seu computador |
| `DB_HOST` | `localhost` | Endereço do banco visto pela API |
| `PORT` | `3001` | Porta da API (o proxy do Vite aponta para ela) |
| `CORS_ORIGIN` | `http://localhost:5173` | Origem do frontend aceita pela API |
| `COMPANY_NAME` | `Nome da Empresa` | Cabeçalho do termo em PDF |

O modo demo não precisa de nenhuma variável.

## Dados de demonstração

Valores esperados logo após carregar o `seed.sql`:

| Indicador | Valor | Motivo |
|---|---|---|
| Equipamentos | 10 | 4 disponíveis, 5 entregues, 1 em manutenção |
| Colaboradores sem notebook | 3 | Diego (só tem desktop), Felipe e Gabriela |
| Entregues sem responsável | 1 | PAT-0009 |
| Com responsável, mas não "entregue" | 1 | PAT-0010 (vínculo aberto com Elisa) |
| Notebooks realmente disponíveis | 2 | PAT-0004 e PAT-0005 (PAT-0010 é excluído) |
| Desligados com equipamento | 1 | Carla (E003), em desligamento, ainda com o PAT-0003 |
| Estoque cobre a demanda? | Não | 2 disponíveis para 3 colaboradores |

Para demonstrações em escala (por exemplo, 150 notebooks), gere dados fictícios:

```bash
python3 tools/gerar_dados_demo.py data/demo/ 150
```

Importe `demo_notebooks.csv` em **Importar equipamentos** e depois `demo_colaboradores.csv` em **Sincronizar colaboradores**.

## Estrutura do projeto

```
it-asset-manager/
├── docker-compose.yml     # PostgreSQL 16 (executa schema.sql e seed.sql na 1ª criação)
├── .env.example           # modelo de configuração (copie para .env)
├── db/
│   ├── schema.sql         # esquema completo do banco
│   ├── seed.sql           # dados fictícios de demonstração
│   └── migrations/        # para bancos criados em versões anteriores
├── backend/src/
│   ├── routes/            # validação (Zod) e camada HTTP
│   ├── services/          # regras de negócio: pgService (PostgreSQL) e memoryService (demo)
│   ├── middleware/        # tratamento de erros (400, 404, 409, 413, 500)
│   ├── pdf/               # geração do termo em PDF
│   ├── importer.js        # leitura e validação de CSVs
│   ├── server.js          # modo com banco  -> npm run dev
│   └── demo-server.js     # modo demo       -> npm run demo
├── frontend/src/          # pages, components e hooks (useAsync, useDebounce, useCountUp)
└── tools/                 # conversor de planilhas, relatório em Excel e gerador de dados fictícios
```

## Como funciona

### Entregas, devoluções e status

- **Entrega:** só com equipamento `disponivel` e sem vínculo aberto, e colaborador existente e ativo. Transação com `SELECT ... FOR UPDATE`: cria o vínculo e muda o status para `entregue`.
- **Devolução:** fecha o vínculo (`returned_at = NOW()`) e define o próximo status (`disponivel` ou `em_manutencao`), em transação.
- **Status manual:** alterna entre `disponivel` e `em_manutencao`; equipamento `entregue` não pode ser alterado (409).
- **Duplicidade** de RA, e-mail, patrimônio ou Service Tag: 409. **Dados inválidos:** 400. **Não encontrado:** 404.
- Patrimônio, Service Tag e etiqueta são salvos em maiúsculas; e-mail em minúsculas.
- Os IDs usam `IDENTITY`: tentativas que falham por duplicidade "consomem" um número, então podem existir saltos. É normal no PostgreSQL.

### Modelos e fotos

O catálogo lista todos os modelos encontrados nos equipamentos (marca + modelo, sem diferenciar maiúsculas). Ao enviar a foto de um modelo, ela aparece em todos os equipamentos dele. Um equipamento pode ter foto própria (opcional), que tem prioridade; sem nenhuma foto, vale uma ilustração por marca.
As fotos são reduzidas no navegador (640 px) e servidas por `GET /api/models/:id/photo` (cacheável, com `?v=` para renovar ao trocar). Para muitos arquivos grandes, o ideal seria um armazenamento de objetos (S3 ou similar), guardando só a URL.

### Manutenção

Registra motivo, fornecedor, nº do chamado e tempo parado. Um equipamento só tem **uma** manutenção aberta (índice único parcial) e equipamentos entregues precisam ser devolvidos antes. Devolver com destino "Em manutenção" também abre o registro, e liberar o equipamento fecha. Equipamentos em manutenção sem registro (dados antigos) aparecem num aviso para você informar o motivo.

### Desligamentos

Registre o colaborador, a data e o nº do chamado. A tela mostra os equipamentos que ainda estão com ele e leva para Movimentações, já com a busca preenchida. **Concluir** só é permitido sem equipamentos pendentes e inativa o colaborador. O painel "Sugestões do AD" lista quem está inativo ou em desligamento no AD, com equipamento e sem registro.

### Auditoria

Cinco verificações calculadas com SQL: desligados (ou em desligamento) com equipamento; colaboradores ativos sem notebook; equipamentos "entregues" sem responsável; equipamentos com responsável sem status "entregue"; e notebooks disponíveis (excluindo os com vínculo aberto), com a conclusão de que o estoque cobre ou não a demanda.

### Termo de responsabilidade em PDF

Botões em Movimentações (tabela de equipamentos em uso e aviso logo após entregar ou devolver) e no Histórico do equipamento. O termo de devolução só existe depois da devolução (409 antes). RA ou e-mail ausentes saem como linha em branco para preencher à mão. **O texto das cláusulas é um modelo genérico: peça revisão ao Jurídico/RH antes de usar.**

### Importar e exportar CSV

- Exportações com separador `;` e UTF-8 com BOM (abrem direto no Excel em português), com proteção contra "CSV injection".
- **Importar equipamentos:** um por linha, com simulação antes de gravar (`?dry_run=true`) e tratamento por linha com `SAVEPOINT` (uma linha com erro não derruba as outras).
  Colunas: `patrimonio;service_tag;tipo;marca;modelo;status;site;hostname;etiqueta;observacoes;colaborador;departamento;ra;email`.
  Obrigatórias: `patrimonio, service_tag, tipo, marca, modelo`. Com `colaborador` e status `entregue`, o colaborador é criado (se não existir) e o vínculo é registrado. Vínculos importados são marcados como `importacao` e não entram no gráfico de movimentações.
- O separador (`;`, `,` ou tab) é detectado pelo cabeçalho. Cabeçalhos alternativos são aceitos (`categoria`, `usuario`, `area`, `unidade`, `matricula`...).
- **Sincronizar colaboradores (AD):** atualiza quem **já existe** com `ra, email, login_ad, situacao, vinculo, data_fim, cargo, gestor, departamento, site` (só as colunas preenchidas). O colaborador é localizado por login, e-mail, RA ou nome (sem acento/caixa); ninguém é criado. Se nome, e-mail, RA e login apontarem para pessoas diferentes, a linha vira erro. Situações: `ativo`, `desativando`, `inativo`.

## API

| Recurso | Endpoints |
|---|---|
| Saúde | `GET /api/health` |
| Equipamentos | `GET /api/assets?status=&type=&search=` · `POST /api/assets` · `PATCH /api/assets/:id` · `PATCH /api/assets/:id/status` · `GET /api/assets/:id/history` |
| Colaboradores | `GET /api/employees?search=` · `POST /api/employees` |
| Movimentações | `GET /api/assignments/open` · `POST /api/assignments` · `POST /api/assignments/:id/return` · `GET /api/assignments/:id/term?tipo=entrega\|devolucao` |
| Modelos | `GET /api/models` · `PUT /api/models` · `GET /api/models/:id/photo` · `DELETE /api/models/:id` |
| Manutenção | `GET /api/maintenances?status=aberto\|concluido\|todos` · `GET /api/maintenances/untracked` · `POST /api/maintenances` · `POST /api/maintenances/:id/close` |
| Desligamentos | `GET /api/offboardings?status=` · `GET /api/offboardings/candidates` · `POST /api/offboardings` · `POST /api/offboardings/:id/close` · `DELETE /api/offboardings/:id` |
| Auditoria e dashboard | `GET /api/audit` · `GET /api/dashboard` |
| CSV | `POST /api/import/assets[?dry_run=true]` · `POST /api/import/employees[?dry_run=true]` (corpo `text/csv`) · `GET /api/export/{assets,employees,movements}.csv` |

## Banco de dados

Tabelas: `employees`, `assets`, `assignments`, `asset_models`, `maintenances` e `offboardings`, com tipos `ENUM` (`asset_status`, `asset_type`), chaves estrangeiras e `CHECK`.
Destaques: **índices únicos parciais** garantem uma única entrega aberta por equipamento (`assignments`), uma única manutenção aberta por equipamento e um único desligamento aberto por colaborador.

Um banco novo já nasce completo com o `schema.sql`. Para bancos criados em versões anteriores, rode as migrações na ordem (todas podem ser executadas mais de uma vez):

| Arquivo | O que adiciona |
|---|---|
| `001_add_photo_url.sql` | foto do equipamento |
| `002_import_export_termo.sql` | site, hostname, etiqueta, origem do vínculo; RA e e-mail opcionais |
| `003_ad_sync.sql` | login do AD, vínculo, situação e data de fim |
| `004_modelos_manutencao_desligamento.sql` | cargo, gestor, catálogo de modelos, manutenção e desligamentos |

```bash
docker compose exec -T db psql -U <POSTGRES_USER> -d <POSTGRES_DB> < db/migrations/004_modelos_manutencao_desligamento.sql
```

## Conversor de planilhas (tools/)

Scripts em Python (`pip install pandas openpyxl`) para preparar dados antes de importar:

| Script | Para que serve |
|---|---|
| `converter_inventario.py` | Converte uma planilha de inventário, cruzando com exportações do AD e do Intune, em CSVs prontos para importar, mais relatórios de pendências, ajustes e divergências |
| `relatorio_xlsx.py` | Monta o relatório de conciliação em Excel, com fórmulas |
| `gerar_dados_demo.py` | Gera dados 100% fictícios para demonstração |

```bash
python3 tools/converter_inventario.py Inventario.xlsx data/saida/ \
    --intune DevicesWithInventory.csv --usuarios export_users.csv [--pais BR] [--campo-ra AD_Login]
python3 tools/relatorio_xlsx.py data/saida/ data/saida/relatorio_conciliacao.xlsx
```

Principais regras do conversor: considera só notebooks; descartados e sem status ficam de fora (com motivo em `pendencias.csv`); o **patrimônio é identificado pelos 4 últimos dígitos**; o Intune recupera hostname e Service Tag faltando; nomes são casados com o AD e erros de digitação só são corrigidos automaticamente com similaridade >= 0,93. O RA é o login Microsoft (`--campo-ra` permite trocar). Ordem recomendada: importar os equipamentos e depois sincronizar os colaboradores.

## Testes manuais

<details>
<summary>Roteiro com curl (sucesso, 400, 404 e 409) e pela interface</summary>

Use o seed recém-carregado (ou reinicie o modo demo).

```bash
B=http://localhost:3001/api
H='Content-Type: application/json'

# 1) Saúde e indicadores
curl $B/health
curl $B/audit            # summary: 3 / 1 / 1 / 2 / stockCoversDemand=false
curl $B/dashboard

# 2) Cadastros com sucesso (201) - note o texto em maiúsculas
curl -X POST $B/assets -H "$H" -d '{"asset_tag":"pat-0011","service_tag":"st11aa22","type":"notebook","brand":"Dell","model":"Latitude 5440"}'
curl -X POST $B/employees -H "$H" -d '{"registration":"E009","name":"Iara Prado","email":"iara.prado@exemplo.com.br","department":"TI"}'

# 3) Casos 409 (duplicidade)
curl -X POST $B/employees -H "$H" -d '{"registration":"E001","name":"X","email":"novo@exemplo.com.br","department":"TI"}'     # matrícula
curl -X POST $B/employees -H "$H" -d '{"registration":"E099","name":"X","email":"ana.souza@exemplo.com.br","department":"TI"}' # e-mail
curl -X POST $B/assets -H "$H" -d '{"asset_tag":"PAT-0001","service_tag":"NOVA1","type":"desktop","brand":"A","model":"B"}'   # patrimônio
curl -X POST $B/assets -H "$H" -d '{"asset_tag":"PAT-0999","service_tag":"ST7K2M91","type":"desktop","brand":"A","model":"B"}' # Service Tag

# 4) Casos 400 (validação)
curl -X POST $B/employees -H "$H" -d '{"name":""}'
curl -X POST $B/assets -H "$H" -d '{"asset_tag":"X","service_tag":"Y","type":"tablet","brand":"A","model":"B"}'
curl -X PATCH $B/assets/8/status -H "$H" -d '{"status":"entregue"}'
curl "$B/assets?status=invalido"
curl -X POST $B/employees -H "$H" -d '{quebrado'

# 5) Casos 404
curl $B/assets/999/history
curl -X POST $B/assignments -H "$H" -d '{"asset_id":999,"employee_id":1}'
curl $B/rota-inexistente

# 6) Entrega e devolução
curl -X POST $B/assignments -H "$H" -d '{"asset_id":4,"employee_id":4,"notes":"Entrega teste"}'   # 201
curl -X POST $B/assignments -H "$H" -d '{"asset_id":4,"employee_id":6}'                            # 409 (já entregue)
curl -X POST $B/assignments -H "$H" -d '{"asset_id":5,"employee_id":8}'                            # 409 (colaborador inativo)
curl -X POST $B/assignments -H "$H" -d '{"asset_id":10,"employee_id":6}'                           # 409 (status disponível, mas com vínculo aberto)
curl -X PATCH $B/assets/4/status -H "$H" -d '{"status":"em_manutencao"}'                           # 409 (entregue)
curl $B/assignments/open                                                                           # anote o id do vínculo criado
curl -X POST $B/assignments/ID/return -H "$H" -d '{"notes":"Teclado com defeito","next_status":"em_manutencao"}'  # 200
curl -X POST $B/assignments/ID/return -H "$H" -d '{}'                                              # 409 (já encerrado)
curl $B/assets/4/history

# 7) Status manual
curl -X PATCH $B/assets/8/status -H "$H" -d '{"status":"em_manutencao"}'   # 200
curl -X PATCH $B/assets/8/status -H "$H" -d '{"status":"disponivel"}'      # 200
```

**Pela interface:**

1. **Dashboard:** total = 10; cards 4/5/1; rosca com 3 fatias; alertas da auditoria e aviso de que o estoque não cobre a demanda.
2. **Equipamentos:** digite "dell" (a busca aguarda uma pausa na digitação); combine filtros; use Manutenção/Liberar; abra o Histórico de PAT-0004; cadastre um item repetido e veja a mensagem de duplicidade.
3. **Colaboradores:** badges "Com notebook"/"Sem notebook"; cadastre e repita a matrícula.
4. **Movimentações:** o formulário lista PAT-0010 como disponível, mas a entrega é recusada (vínculo aberto): é a inconsistência detectada pela auditoria. Faça uma entrega válida e uma devolução.
5. **Auditoria:** quatro seções com contadores; depois de entregar notebooks aos colaboradores sem notebook, o contador cai e a mensagem muda quando o estoque passa a cobrir a demanda.
6. **Erro de rede:** pare o backend e recarregue uma página: deve aparecer a mensagem com o botão "Tentar novamente".

</details>

## Segurança e privacidade

- Queries parametrizadas, validação com Zod, `helmet`, CORS restrito e segredos apenas no `.env` (ignorado pelo Git).
- **O sistema não tem autenticação.** Use em ambiente local ou de estudo; não publique uma instância na internet com dados reais.
- Este repositório contém **somente dados fictícios**. Inventário, AD, Intune e CSVs reais ficam fora: a pasta `data/` e os arquivos `*.csv`, `*.xlsx` e `*.xls` estão no `.gitignore`.
- Dados de pessoas (nome, e-mail, login) são dados pessoais: observe a LGPD ao usar o sistema com dados reais.
- Se algum dado real chegar a ser commitado, apagar o arquivo não basta, pois ele continua no histórico do Git.

## Para estudar SQL

`db/schema.sql` (ENUM, FK, CHECK, índices únicos parciais) e `backend/src/services/pgService.js` (JOINs, `EXISTS`/`NOT EXISTS`, CTE, `FULL OUTER JOIN`, `json_agg`, `generate_series`, `FOR UPDATE`, transações com `SAVEPOINT`, `ON CONFLICT`) concentram os conceitos principais. Tente reescrever as consultas da auditoria por conta própria e compare os resultados.
