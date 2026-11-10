#!/usr/bin/env python3
"""
Gera dados 100% FICTICIOS em escala (padrao: 150 notebooks) para demonstracao e prints, sem nenhum dado real.

Uso: python3 tools/gerar_dados_demo.py data/demo/ [quantidade]
Gera: demo_notebooks.csv (importar em "Importar equipamentos") e demo_colaboradores.csv (importar em "Sincronizar colaboradores").
A semente e fixa: o resultado e sempre o mesmo. Nomes sao combinacoes aleatorias de listas genericas.
"""
import csv, random, sys
from pathlib import Path

saida = Path(sys.argv[1]); saida.mkdir(parents=True, exist_ok=True)
n = int(sys.argv[2]) if len(sys.argv) > 2 else 150
rnd = random.Random(2026)

NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Heitor', 'Isabela', 'João', 'Karina', 'Lucas', 'Marina',
         'Nicolas', 'Olívia', 'Pedro', 'Rafaela', 'Sérgio', 'Tatiana', 'Vinícius', 'Yasmin', 'Rodrigo', 'Camila', 'Thiago']
SOBRENOMES = ['Almeida', 'Barros', 'Carvalho', 'Dias', 'Esteves', 'Farias', 'Gomes', 'Holanda', 'Ibrahim', 'Jardim', 'Klein', 'Lopes',
              'Moura', 'Neves', 'Oliveira', 'Pinto', 'Queiroz', 'Ramos', 'Saldanha', 'Teixeira', 'Uchoa', 'Vidal', 'Xavier', 'Zanetti']
SITES = ['Matriz', 'Filial Norte', 'Filial Sul']
AREAS = ['Tecnologia', 'Financeiro', 'RH', 'Comercial', 'Logística', 'Jurídico', 'Marketing', 'Operações']
CARGOS = ['Analista', 'Assistente', 'Coordenador', 'Gerente', 'Especialista', 'Estagiário']
MODELOS = [('Dell', 'Latitude 3420', 24), ('Dell', 'Latitude 5440', 12), ('HP', 'ProBook 440 G8', 22), ('HP', 'ProBook 440 G11', 18),
           ('HP', 'EliteBook 840 G9', 8), ('Lenovo', 'ThinkPad E14', 10), ('Lenovo', 'IdeaPad 3', 6)]
pesos = [m[2] for m in MODELOS]

nomes, usados = [], set()
while len(nomes) < int(n * 0.9):
    nome = f'{rnd.choice(NOMES)} {rnd.choice(SOBRENOMES)}'
    if nome not in usados:
        usados.add(nome); nomes.append(nome)

gente = {}
for nome in nomes:
    login = f'u{rnd.randint(100000, 999999)}'
    situacao = rnd.choices(['ativo', 'desativando', 'inativo'], [90, 6, 4])[0]
    gente[nome] = {'colaborador': nome, 'login_ad': login, 'email': f'{nome.lower().replace(" ", ".").replace("ã", "a").replace("í", "i").replace("é", "e").replace("ó", "o").replace("ô", "o").replace("é", "e")}@exemplo.com.br',
                   'ra': login, 'situacao': situacao, 'vinculo': rnd.choices(['Employee', 'Temporary Work'], [92, 8])[0],
                   'data_fim': '2026-12-15' if situacao == 'desativando' and rnd.random() < .6 else '', 'cargo': f'{rnd.choice(CARGOS)} de {rnd.choice(AREAS)}',
                   'gestor': f'{rnd.choice(NOMES)} {rnd.choice(SOBRENOMES)}', 'departamento': rnd.choice(AREAS), 'site': rnd.choice(SITES)}

linhas = []
for i in range(n):
    marca, modelo, _ = rnd.choices(MODELOS, pesos)[0]
    estoque = i >= len(nomes)
    quem = None if estoque else nomes[i]
    p = gente[quem] if quem else None
    linhas.append({'patrimonio': f'{1000 + i:04d}', 'service_tag': f'DEMO{rnd.randint(10**5, 10**6 - 1)}', 'tipo': 'notebook', 'marca': marca,
                   'modelo': modelo, 'status': 'disponivel' if estoque else 'entregue', 'site': p['site'] if p else rnd.choice(SITES),
                   'hostname': f'DEMOLAPOFF26{1000 + i:04d}', 'etiqueta': f'C{900000 + i}', 'observacoes': '',
                   'colaborador': quem or '', 'departamento': p['departamento'] if p else '', 'ra': '', 'email': ''})

with open(saida / 'demo_notebooks.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=list(linhas[0]), delimiter=';'); w.writeheader(); w.writerows(linhas)
cols = ['colaborador', 'login_ad', 'email', 'ra', 'situacao', 'vinculo', 'data_fim', 'cargo', 'gestor', 'departamento', 'site']
with open(saida / 'demo_colaboradores.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=cols, delimiter=';', extrasaction='ignore'); w.writeheader(); w.writerows(gente.values())
print(f'{len(linhas)} equipamentos, {len(gente)} colaboradores ({sum(1 for g in gente.values() if g["situacao"] != "ativo")} inativos/desativando)')
