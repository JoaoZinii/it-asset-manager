#!/usr/bin/env python3
"""
Monta o relatorio de conciliacao em Excel a partir dos CSVs gerados por converter_inventario.py.
Uso: python3 tools/relatorio_xlsx.py saida/ relatorio_conciliacao.xlsx
As contagens do Resumo sao FORMULAS ligadas as abas de detalhe. Depois de gerar, recalcule (LibreOffice) para ver os valores.
"""
import sys
from pathlib import Path
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

pasta, destino = Path(sys.argv[1]), sys.argv[2]
ler = lambda n: pd.read_csv(pasta / f'{n}.csv', sep=';', encoding='utf-8-sig', dtype=str).fillna('')
F = 'Arial'
head_font = Font(name=F, bold=True, color='FFFFFF'); head_fill = PatternFill('solid', fgColor='0E2038')
base = Font(name=F, size=10); bold = Font(name=F, size=10, bold=True)
blue = Font(name=F, size=10, color='0000FF')       # valor digitado (entrada), nao formula
note = Font(name=F, size=9, color='5B6B80')
thin = Side(style='thin', color='D0D7E2'); box = Border(top=thin, bottom=thin, left=thin, right=thin)

wb = Workbook()
rs = wb.active; rs.title = 'Resumo'
N_OK = len(ler('notebooks_para_importar')); N_COLAB = len(ler('colaboradores_ad'))


def aba(nome, df, larguras):
    ws = wb.create_sheet(nome)
    ws.append(list(df.columns))
    for c in ws[1]:
        c.font = head_font; c.fill = head_fill
    for _, r in df.iterrows():
        ws.append([int(v) if (k == 'linha_inventario' and v.isdigit()) else v for k, v in r.items()])
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.font = base
    for i, w in enumerate(larguras, 1):
        ws.column_dimensions[chr(64 + i)].width = w
    ws.freeze_panes = 'A2'; ws.auto_filter.ref = ws.dimensions


aba('Pendências', ler('pendencias'), [16, 12, 26, 20, 14, 16, 12, 16, 80])
aba('Ajustes', ler('ajustes'), [16, 12, 26, 14, 14, 90])
aba('Divergências', ler('divergencias'), [26, 16, 12, 16, 20, 30, 90])
aba('Desligados', ler('desligados_com_equipamento'), [28, 18, 12, 12, 16, 12])
aba('Sem correspondência AD', ler('sem_correspondencia_ad'), [30, 12, 12, 28, 30, 44])

rs.column_dimensions['A'].width = 66; rs.column_dimensions['B'].width = 12; rs.column_dimensions['C'].width = 78
rs['A1'] = 'Conciliação do inventário de notebooks — Inventário × AD × Intune'; rs['A1'].font = Font(name=F, size=14, bold=True)
rs['A2'] = 'Contagens abaixo são fórmulas ligadas às abas de detalhe. Células em azul são valores digitados (contagem dos CSVs gerados).'; rs['A2'].font = note


def secao(r, titulo):
    rs.cell(r, 1, titulo).font = head_font
    for c in range(1, 4):
        rs.cell(r, c).fill = head_fill


def linha(r, rotulo, formula, nota='', entrada=False):
    rs.cell(r, 1, rotulo).font = base
    c = rs.cell(r, 2, formula); c.font = blue if entrada else base; c.alignment = Alignment(horizontal='right')
    rs.cell(r, 3, nota).font = note
    for k in range(1, 4):
        rs.cell(r, k).border = box


def bloco(r, titulo, itens, intervalo, total_rotulo, total_ref=None):
    secao(r, titulo); r += 1; r0 = r
    for rotulo, padrao, nota in itens:
        linha(r, rotulo, f'=COUNTIF({intervalo},"{padrao}")', nota); r += 1
    linha(r, total_rotulo, f'=SUM(B{r0}:B{r-1})'); rs.cell(r, 1).font = bold; rs.cell(r, 2).font = bold
    if total_ref:
        linha(r + 1, 'Conferência', f'=IF(B{r}={total_ref},"OK","VERIFICAR")'); r += 1
    return r + 2


secao(4, 'Visão geral')
linha(5, 'Notebooks prontos para importar (notebooks_para_importar.csv)', N_OK, 'Valor digitado.', True)
linha(6, 'Notebooks fora da importação (aba Pendências)', "=COUNTA('Pendências'!$A$2:$A$5000)")
linha(7, 'Total de notebooks na planilha de origem', '=B5+B6', 'Deve bater com o filtro Categoria = Notebook na aba Inventário.')
linha(8, 'Colaboradores com dados do AD (colaboradores_ad.csv)', N_COLAB, 'Valor digitado.', True)

P = "'Pendências'!$I$2:$I$5000"; A = "Ajustes!$E$2:$E$5000"; D = "'Divergências'!$A$2:$A$5000"; S = "'Sem correspondência AD'!$D$2:$D$5000"
r = 10
r = bloco(r, 'Fora da importação, por motivo', [
    ('Descartado (fora do escopo operacional)', 'Descartado*', 'Se quiser manter histórico, dá para criar o status "descartado".'),
    ('Status não informado', 'Status não informado*', 'A maioria são linhas quase vazias.'),
    ('Modelo vazio', 'Modelo vazio*', 'Sem modelo não dá para classificar a marca.'),
    ('Modelo não reconhecido', 'Modelo não reconhecido*', ''),
    ('Categoria suspeita (dock/monitor)', 'Categoria suspeita*', ''),
    ('Sem Service Tag', 'Sem Service Tag*', 'Service Tag é obrigatória.'),
    ('Sem patrimônio, sem hostname e sem etiqueta', 'Sem patrimônio*', ''),
    ('Duplicado (mesma Service Tag em mais de uma linha)', 'Duplicado*', 'Mantida a linha mais completa.'),
    ('Patrimônio repetido com Service Tags diferentes', 'Patrimônio * repetido*', 'Pela regra dos 4 últimos dígitos; verificar qual está correto.'),
    ('Patrimônio já pertence a outro equipamento (confirmado pelo hostname)', 'Patrimônio * já pertence*', ''),
], P, 'Soma dos motivos', 'B6')
r = bloco(r, 'Ajustes automáticos nas linhas importadas (uma linha pode ter mais de um)', [
    ('Patrimônio normalizado para os 4 últimos dígitos', 'Patrimônio', 'Ex.: "C 1882" e "CH001882" viram 1882.'),
    ('Hostname atualizado pelo Intune', 'Hostname', 'O Intune tem o nome atual do equipamento.'),
    ('Colaborador corrigido/identificado (similaridade ou usuário principal do Intune)', 'Colaborador', 'Inclui os "Compartilhado" por área.'),
    ('Service Tag recuperada pelo Intune', 'Service Tag', ''),
    ('Atenção: conferir manualmente', 'Atenção', 'Patrimônio × hostname divergentes, patrimônio por palpite, nomes de um termo só.'),
], A, 'Total de ajustes')
r = bloco(r, 'Divergências inventário × Intune (não alteram a importação)', [
    ('Notebook em uso que não aparece no Intune', 'Fora do Intune', 'Não gerenciado, serial diferente ou equipamento já desligado.'),
    ('Notebook no Intune (sites do Brasil) que não está no inventário', 'Intune sem inventário', 'Candidatos a cadastrar.'),
    ('Usuário do inventário diferente do usuário principal do Intune', 'Usuário diferente*', 'Provável troca de dono não registrada.'),
    ('Notebook não conforme no Intune', 'Não conforme*', ''),
], D, 'Total de divergências')
r = bloco(r, 'Colaboradores do inventário sem correspondência no AD', [
    ('Nome de um termo só', 'nome de um termo*', 'Confirmar com RH/identidade.'),
    ('Sem correspondência exata', 'sem correspondência*', 'Ver sugestões por similaridade e pelo Intune na aba.'),
    ('Nome repetido no AD (ambíguo)', 'nome repetido*', ''),
], S, 'Total sem correspondência')
secao(r, 'Segurança'); linha(r + 1, 'Notebooks em posse de desligado ou em desligamento (aba Desligados)', "=COUNTA(Desligados!$A$2:$A$5000)", 'Programar a devolução.')
wb.save(destino)
