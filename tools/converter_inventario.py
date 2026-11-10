#!/usr/bin/env python3
"""
Converte o inventario (aba "Inventário"), cruzando com o Intune e o AD, em CSVs prontos para o IT Asset Manager.

Uso:
  python3 tools/converter_inventario.py Inventario.xlsx saida/ \\
      [--intune DevicesWithInventory.csv] [--usuarios export_users.csv] \\
      [--pais BR] [--campo-ra AD_Login|Corp_ID|Local_ID]   (RA = login Microsoft, ex.: u000000)

Gera em saida/:
  notebooks_para_importar.csv   importar em "Importar / Exportar > Importar equipamentos"
  colaboradores_ad.csv          importar em "Sincronizar colaboradores (AD)" (RA, e-mail, login, situacao)
  pendencias.csv                notebooks NAO importados e o motivo
  ajustes.csv                   correcoes automaticas feitas (para conferir)
  divergencias.csv              inventario x Intune (usuario diferente, fora do Intune, nao conforme...)
  desligados_com_equipamento.csv, sem_correspondencia_ad.csv

Regras:
  * so Categoria = Notebook; descartados e "status nao informado" ficam fora;
  * PATRIMONIO = os 4 ULTIMOS DIGITOS (prefixos C, CH, S etc. sao ignorados). Sem patrimonio, usa o final do
    hostname (inventario ou Intune); a etiqueta de codigo de barras e outra serie e so entra como ultimo recurso;
  * hostname e Service Tag faltando sao recuperados do Intune quando ha correspondencia segura;
  * nomes sao casados com o AD (so o pais escolhido); nome parecido so e corrigido automaticamente com similaridade >= 0.93.
Dados reais ficam fora do Git (pasta data/ no .gitignore).
"""
import argparse, csv, difflib, re, unicodedata
from pathlib import Path
import pandas as pd

COLS = ['patrimonio', 'service_tag', 'tipo', 'marca', 'modelo', 'status', 'site', 'hostname', 'etiqueta',
        'observacoes', 'colaborador', 'departamento', 'ra', 'email']
PARTICULAS = {'da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du'}
NOMES_MODELO = {'probook': 'ProBook', 'elitebook': 'EliteBook', 'latitude': 'Latitude', 'vostro': 'Vostro',
                'thinkpad': 'ThinkPad', 'ideapad': 'IdeaPad'}
STATUS_AD = {'Active': 'ativo', 'Being deactivated': 'desativando', 'Desactive': 'inativo'}
PRIORIDADE = {'Active': 0, 'Being deactivated': 1, 'Desactive': 2}
NOTEBOOK_RE = re.compile(r'notebook|latitude|vostro|probook|elitebook|thinkpad|ideapad|laptop', re.I)


def txt(v):
    return '' if pd.isna(v) else re.sub(r'\s+', ' ', str(v)).strip()


def nn(s):
    """Chave de comparacao de nomes: sem acento, minusculas, hifen/espaco unificados."""
    s = unicodedata.normalize('NFD', str(s))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[\s\-]+', ' ', s.lower()).strip(' ;,.')


def nome_proprio(n):
    palavras = txt(n).strip(' ;,').split(' ')
    out = []
    for i, w in enumerate(palavras):
        out.append(w.lower() if i > 0 and w.lower() in PARTICULAS else '-'.join(p[:1].upper() + p[1:].lower() for p in w.split('-')))
    return ' '.join(out)


def marca_modelo(bruto):
    s = txt(bruto)
    if not s or s == '0':
        return None, None, 'Modelo vazio'
    baixo = s.lower()
    if re.search(r'dock|\be22\b|\bp22\b', baixo):
        return None, None, 'Categoria suspeita (dock/monitor classificado como notebook)'
    if re.search(r'latitude|vostro|^dell', baixo):
        marca = 'Dell'
    elif re.search(r'^hp|probook|elitebook', baixo):
        marca = 'HP'
    elif re.search(r'lenovo|thinkpad|ideapad', baixo):
        marca = 'Lenovo'
    else:
        return None, None, f'Modelo não reconhecido ("{s}")'
    resto = re.sub(r'^(dell|hp|lenovo)\s*', '', s, flags=re.I).strip()
    tokens = []
    for t in resto.split(' '):
        if not t:
            continue
        tl = t.lower()
        tokens.append(NOMES_MODELO.get(tl) or (t.upper() if re.search(r'\d', t) else t.capitalize()))
    return marca, ' '.join(tokens) or 'Não informado', None


def ult4(valor):
    """4 ultimos digitos (regra do patrimonio). None se nao houver digitos."""
    d = re.sub(r'\D', '', txt(valor))
    return d[-4:].zfill(4) if d else None


def final4(hostname):
    m = re.search(r'(\d{4})$', txt(hostname))
    return m.group(1) if m else None


def main(entrada, saida, intune=None, usuarios=None, pais='BR', campo_ra='AD_Login'):
    saida = Path(saida)
    saida.mkdir(parents=True, exist_ok=True)
    df = pd.read_excel(entrada, 'Inventário', dtype=str)
    df['linha'] = df.index + 2
    nb = df[df['Categoria'] == 'Notebook'].copy()

    # ------------------------------------------------------------ Intune
    dev = pd.DataFrame(columns=['id', 'nome', 'serie', 'email', 'modelo', 'conformidade', 'gerenciado'])
    if intune:
        raw = pd.read_csv(intune, dtype=str, encoding='utf-8-sig').fillna('')
        dev = pd.DataFrame({'id': raw['Device ID'], 'nome': raw['Device name'].str.upper().str.strip(),
                            'serie': raw['Serial number'].str.upper().str.strip(),
                            'email': raw['Primary user email address'].str.lower().str.strip(),
                            'modelo': raw['Model'], 'conformidade': raw['Compliance'], 'gerenciado': raw['Managed by']})
    por_serie = {k: g for k, g in dev[dev.serie != ''].groupby('serie')}
    por_nome = {k: g for k, g in dev[dev.nome != ''].groupby('nome')}

    def device_por_serie(st):
        g = por_serie.get(st)
        return g.iloc[0] if g is not None and len(g) == 1 else None  # serie repetida = ambiguo

    def device_por_nome(hn):
        g = por_nome.get(hn)
        return g.iloc[0] if g is not None and len(g) == 1 else None

    # ------------------------------------------------------------ AD
    ad = pd.DataFrame()
    if usuarios:
        ad = pd.read_csv(usuarios, dtype=str, sep=';', encoding='utf-8-sig').fillna('')
        ad = ad[ad['Country_ISO'].str.upper() == pais.upper()].copy()
        ad['chave'] = ad['FullName'].map(nn)
        ad['email'] = ad['Email'].str.lower()
        ad['prio'] = ad['User_status'].map(PRIORIDADE).fillna(3)
    ad_por_chave = {k: g.sort_values('prio') for k, g in ad.groupby('chave')} if len(ad) else {}
    ad_por_email = {r['email']: r for _, r in ad.iterrows()} if len(ad) else {}
    ativos = ad[ad.User_status == 'Active'] if len(ad) else ad
    chaves_ativas = sorted(ativos.chave.unique()) if len(ad) else []

    def escolher_ad(chave):
        """Devolve (usuario|None, motivo). Prefere Active; empate dentro do mesmo status = ambiguo."""
        g = ad_por_chave.get(chave)
        if g is None:
            return None, 'sem correspondência exata'
        melhor = g[g.prio == g.prio.min()]
        return (melhor.iloc[0], None) if len(melhor) == 1 else (None, 'nome repetido no AD (ambíguo)')

    pend, ajustes, diverg = [], [], []

    def rejeitar(r, motivo):
        pend.append({'linha_inventario': r['linha'], 'site': txt(r['Site']), 'usuario': txt(r['Usuário']),
                     'modelo': txt(r['Modelo']), 'patrimonio': txt(r['Patrimônio']), 'service_tag': txt(r['Service Tag']),
                     'etiqueta': txt(r['Etiqueta']), 'status_origem': txt(r['Status']), 'motivo': motivo})

    def ajustar(c, tipo, texto):
        r = c['r']
        ajustes.append({'linha_inventario': r['linha'], 'site': txt(r['Site']), 'usuario': txt(r['Usuário']),
                        'patrimonio': txt(r['Patrimônio']), 'tipo': tipo, 'ajuste': texto})

    # ------------------------------------------------------------ 1) filtros e identificadores
    cands = []
    for _, r in nb.iterrows():
        status = txt(r['Status'])
        if status == 'Descartado':
            rejeitar(r, 'Descartado (fora do escopo operacional)'); continue
        if status not in ('Em Uso', 'Em Estoque'):
            rejeitar(r, 'Status não informado'); continue
        marca, modelo, erro = marca_modelo(r['Modelo'])
        if erro:
            rejeitar(r, erro); continue
        c = {'r': r, 'marca': marca, 'modelo': modelo, 'ajs': []}
        st = re.sub(r'\s', '', txt(r['Service Tag'])).upper()
        hn = txt(r['Hostname']).upper()
        d = None
        if not st and hn:  # recupera a Service Tag pelo hostname
            d = device_por_nome(hn)
            if d is not None and d['serie']:
                st = d['serie']; c['ajs'].append(('Service Tag', f'Service Tag recuperada pelo Intune (hostname {hn})'))
        if not st:
            rejeitar(r, 'Sem Service Tag'); continue
        d = d if d is not None else device_por_serie(st)
        c['dev'] = d
        if d is not None and d['nome'] and d['nome'] != hn:
            c['ajs'].append(('Hostname', f'Hostname atualizado pelo Intune ("{hn or "vazio"}" → "{d["nome"]}")'))
            hn = d['nome']
        c['st'], c['hn'] = st, hn
        etiqueta = re.sub(r'[^A-Za-z0-9]', '', txt(r['Etiqueta'])).upper()
        c['etiqueta'] = etiqueta
        p4, h4 = ult4(r['Patrimônio']), final4(hn)
        if p4:
            tag = p4
            if h4 and h4 != p4:
                c['ajs'].append(('Atenção', f'Patrimônio {p4} difere do final do hostname {hn} ({h4}): conferir'))
        elif h4:
            tag = h4; c['ajs'].append(('Atenção', f'Patrimônio vazio: usados os 4 últimos dígitos do hostname {hn} (palpite: vale em ~80% dos casos)'))
        elif etiqueta:
            tag = etiqueta; c['ajs'].append(('Atenção', 'Sem patrimônio nem hostname: usada a etiqueta (série diferente do patrimônio)'))
        else:
            rejeitar(r, 'Sem patrimônio, sem hostname e sem etiqueta'); continue
        c['tag'], c['p4'], c['h4'] = tag, p4, h4
        orig = txt(r['Patrimônio'])
        if orig and orig != tag:
            c['ajs'].append(('Patrimônio', f'Patrimônio "{orig}" → {tag} (4 últimos dígitos)'))
        cands.append(c)

    # ------------------------------------------------------------ 2) mesma Service Tag duplicada
    por_st = {}
    for c in cands:
        por_st.setdefault(c['st'], []).append(c)
    sobrev = []
    for st, g in por_st.items():
        g.sort(key=lambda c: -(bool(c['etiqueta']) * 2 + bool(c['hn'])))
        for extra in g[1:]:
            rejeitar(extra['r'], f'Duplicado: Service Tag {st} repetida (mantida a linha {g[0]["r"]["linha"]})')
        sobrev.append(g[0])

    # ------------------------------------------------------------ 3) mesmo patrimonio, Service Tags diferentes
    por_tag = {}
    for c in sobrev:
        por_tag.setdefault(c['tag'], []).append(c)
    finais = []
    for tag, g in por_tag.items():
        if len(g) == 1:
            finais.append(g[0]); continue
        confirmados = [c for c in g if c['h4'] == tag]  # o hostname confirma qual equipamento e o dono do numero
        if len(confirmados) == 1:
            finais.append(confirmados[0])
            for c in g:
                if c is not confirmados[0]:
                    rejeitar(c['r'], f'Patrimônio {tag} já pertence a outro equipamento (confirmado pelo hostname {confirmados[0]["hn"]}); verificar o correto')
        else:
            for c in g:
                rejeitar(c['r'], f'Patrimônio {tag} repetido com Service Tags diferentes (verificar qual está correto)')
    finais.sort(key=lambda c: c['r']['linha'])

    # ------------------------------------------------------------ 4) colaboradores x AD
    pessoas = {}      # chave do nome no inventario -> {'nome', 'ad'}
    sem_match = []
    for c in finais:
        r = c['r']
        usuario = txt(r['Usuário'])
        c['colab'], c['ad'] = '', None
        if usuario in ('Estoque', 'Compartilhado', ''):
            continue
        chave = nn(usuario)
        if chave in pessoas:
            c['colab'], c['ad'] = pessoas[chave]['nome'], pessoas[chave]['ad']; continue
        u, motivo = escolher_ad(chave)
        origem = None
        if u is None and len(ad):
            partes = set(chave.split())
            # (a) nome do inventario contido no nome de um usuario do AD e confirmado pelo usuario principal do Intune
            if c['dev'] is not None and c['dev']['email'] in ad_por_email:
                cand = ad_por_email[c['dev']['email']]
                if partes and partes <= set(nn(cand['FullName']).split()):
                    u, origem = cand, 'Colaborador identificado pelo usuário principal do Intune'
            # (b) erro de digitacao: similaridade muito alta com um unico nome ativo
            if u is None and ' ' in chave:
                perto = difflib.get_close_matches(chave, chaves_ativas, n=2, cutoff=0.93)
                if len(perto) == 1:
                    u, origem = ad_por_chave[perto[0]].iloc[0], 'Nome corrigido por similaridade com o AD'
        nome = nome_proprio(u['FullName']) if u is not None else nome_proprio(usuario)
        if u is not None and origem:
            ajustar(c, 'Colaborador', f'{origem}: "{usuario}" → "{nome}"')
        if u is None:
            sug = difflib.get_close_matches(chave, chaves_ativas, n=1, cutoff=0.8) if chaves_ativas else []
            sug_intune = ''
            if c['dev'] is not None and c['dev']['email'] in ad_por_email:
                sug_intune = f"{ad_por_email[c['dev']['email']]['FullName']} <{c['dev']['email']}>"
            sem_match.append({'colaborador_inventario': usuario, 'patrimonio': c['tag'], 'site': txt(r['Site']),
                              'motivo': ('nome de um termo só' if ' ' not in chave else motivo),
                              'sugestao_por_similaridade': nome_proprio(ad_por_chave[sug[0]].iloc[0]['FullName']) if sug else '',
                              'sugestao_pelo_intune': sug_intune})
        pessoas[chave] = {'nome': nome, 'ad': u}
        c['colab'], c['ad'] = nome, u

    # ------------------------------------------------------------ 5) saidas
    def ra_de(u):
        v = u[campo_ra] if u is not None else ''
        return '' if v in ('0', 'No Value') else v

    ok = []
    for c in finais:
        r = c['r']
        usuario = txt(r['Usuário']); area = txt(r['Área'])
        if usuario == 'Estoque':
            colab, status, depto = '', 'disponivel', ''
        elif usuario == 'Compartilhado':
            colab = f'Compartilhado - {area if area and area != "Não informada" else txt(r["Site"])}'
            status, depto = 'entregue', area
            c['ajs'].append(('Colaborador', f'Usuário "Compartilhado": criado colaborador "{colab}"'))
        else:
            colab, status, depto = c['colab'], 'entregue', area
            if ' ' not in colab and c['ad'] is None:
                c['ajs'].append(('Atenção', f'Nome com um só termo ("{colab}") sem correspondência no AD'))
        u = c['ad']
        obs = [txt(r['Observação'])] + (['OT: Sim'] if txt(r['OT']) == 'Sim' else [])
        ok.append({'patrimonio': c['tag'], 'service_tag': c['st'], 'tipo': 'notebook', 'marca': c['marca'],
                   'modelo': c['modelo'], 'status': status, 'site': txt(r['Site']), 'hostname': c['hn'],
                   'etiqueta': c['etiqueta'], 'observacoes': ' | '.join(o for o in obs if o), 'colaborador': colab,
                   'departamento': depto, 'ra': ra_de(u), 'email': u['email'] if u is not None else ''})
        for tipo, texto in c['ajs']:
            ajustar(c, tipo, texto)

        d = c['dev']  # divergencias com o Intune (informativas, nao alteram a importacao)
        base = {'linha_inventario': r['linha'], 'patrimonio': c['tag'], 'service_tag': c['st'], 'hostname': c['hn'],
                'colaborador_inventario': colab}
        if len(dev):
            if d is None and status == 'entregue':
                diverg.append({**base, 'tipo': 'Fora do Intune', 'detalhe': 'Notebook em uso que não aparece no Intune (não gerenciado, desligado ou serial diferente)'})
            if d is not None:
                if d['conformidade'] == 'Noncompliant':
                    diverg.append({**base, 'tipo': 'Não conforme (Intune)', 'detalhe': f'Gerenciado por {d["gerenciado"]}'})
                if d['email'] and colab and not colab.startswith('Compartilhado'):
                    u_int = ad_por_email.get(d['email'])
                    nome_int = nome_proprio(u_int['FullName']) if u_int is not None else d['email']
                    if nn(nome_int) != nn(colab):
                        diverg.append({**base, 'tipo': 'Usuário diferente do Intune',
                                       'detalhe': f'Inventário: {colab} | Intune (usuário principal): {nome_int}'})
                if status == 'disponivel' and d['email']:
                    diverg.append({**base, 'tipo': 'Usuário diferente do Intune',
                                   'detalhe': f'Em estoque no inventário, mas o Intune mostra usuário principal {d["email"]}'})

    # Intune sem inventario (somente notebooks dos sites/usuarios do pais)
    if len(dev):
        series_inv = {c['st'] for c in finais} | {txt(r['Service Tag']).upper() for _, r in nb.iterrows()}
        prefixos = {c['hn'][:3] for c in finais if c['hn']}
        for _, d in dev.iterrows():
            if d['serie'] in series_inv or not NOTEBOOK_RE.search(d['modelo']):
                continue
            if d['nome'][:3] in prefixos or d['email'] in ad_por_email:
                u_int = ad_por_email.get(d['email'])
                quem = nome_proprio(u_int['FullName']) if u_int is not None else (d['email'] or '—')
                diverg.append({'tipo': 'Intune sem inventário', 'linha_inventario': '', 'patrimonio': final4(d['nome']) or '',
                               'service_tag': d['serie'], 'hostname': d['nome'], 'colaborador_inventario': '',
                               'detalhe': f'{d["modelo"]} | usuário: {quem} | {d["conformidade"]}'})

    deslig, colabs_ad, vistos = [], [], set()
    for c in finais:
        u = c['ad']
        if u is None:
            continue
        if u['User_status'] != 'Active':
            deslig.append({'colaborador': c['colab'], 'situacao_ad': u['User_status'], 'data_fim': u['IS_end_date'][:10],
                           'patrimonio': c['tag'], 'service_tag': c['st'], 'site': txt(c['r']['Site'])})
        if c['colab'] in vistos:
            continue
        vistos.add(c['colab'])
        fim = u['IS_end_date'][:10] if u['IS_end_date'][:4].isdigit() and int(u['IS_end_date'][:4]) < 2050 else ''
        colabs_ad.append({'colaborador': c['colab'], 'login_ad': u['AD_Login'], 'email': u['email'], 'ra': ra_de(u),
                          'situacao': STATUS_AD.get(u['User_status'], 'ativo'), 'vinculo': u['Category'], 'data_fim': fim,
                          'gestor': nome_proprio(u['Hierarchical']) if u.get('Hierarchical') else ''})

    def grava(nome, linhas, cols):
        with open(saida / nome, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, fieldnames=cols, delimiter=';', quoting=csv.QUOTE_MINIMAL)
            w.writeheader(); w.writerows(linhas)

    grava('notebooks_para_importar.csv', ok, COLS)
    grava('colaboradores_ad.csv', colabs_ad, ['colaborador', 'login_ad', 'email', 'ra', 'situacao', 'vinculo', 'data_fim', 'gestor'])
    grava('pendencias.csv', sorted(pend, key=lambda p: p['linha_inventario']),
          ['linha_inventario', 'site', 'usuario', 'modelo', 'patrimonio', 'service_tag', 'etiqueta', 'status_origem', 'motivo'])
    grava('ajustes.csv', ajustes, ['linha_inventario', 'site', 'usuario', 'patrimonio', 'tipo', 'ajuste'])
    grava('divergencias.csv', diverg, ['tipo', 'linha_inventario', 'patrimonio', 'service_tag', 'hostname', 'colaborador_inventario', 'detalhe'])
    grava('desligados_com_equipamento.csv', deslig, ['colaborador', 'situacao_ad', 'data_fim', 'patrimonio', 'service_tag', 'site'])
    grava('sem_correspondencia_ad.csv', sem_match, ['colaborador_inventario', 'patrimonio', 'site', 'motivo', 'sugestao_por_similaridade', 'sugestao_pelo_intune'])

    print(f'Notebooks na planilha:      {len(nb)}')
    print(f'Prontos para importar:      {len(ok)}  (colaboradores distintos: {len({c["colab"] for c in finais if c["colab"]})})')
    print(f'Fora da importação:         {len(pend)}')
    print(f'Ajustes automáticos:        {len(ajustes)}')
    print(f'Colaboradores com dados AD: {len(colabs_ad)} | sem correspondência: {len(sem_match)} | desligados c/ equipamento: {len(deslig)}')
    print(f'Divergências com o Intune:  {len(diverg)}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('entrada'); ap.add_argument('saida')
    ap.add_argument('--intune'); ap.add_argument('--usuarios')
    ap.add_argument('--pais', default='BR'); ap.add_argument('--campo-ra', default='AD_Login', choices=['Corp_ID', 'AD_Login', 'Local_ID'])
    a = ap.parse_args()
    main(a.entrada, a.saida, a.intune, a.usuarios, a.pais, a.campo_ra)
