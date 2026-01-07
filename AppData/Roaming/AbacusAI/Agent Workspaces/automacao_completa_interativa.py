# -*- coding: utf-8 -*-
import time
import re
import json
import os
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
import PyPDF2

ARQUIVO_MEMORIA = "automacao_memoria.json"

def salvar_memoria(caminho_pdf, dados_edital):
    memoria = {
        'caminho_pdf': caminho_pdf,
        'data_execucao': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        'total_pessoas': len(dados_edital),
        'nomes': [p['nome'] for p in dados_edital]
    }

    with open(ARQUIVO_MEMORIA, 'w', encoding='utf-8') as f:
        json.dump(memoria, f, indent=2, ensure_ascii=False)

    print(f"[OK] Memoria salva: {ARQUIVO_MEMORIA}")

def carregar_memoria():
    if os.path.exists(ARQUIVO_MEMORIA):
        try:
            with open(ARQUIVO_MEMORIA, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return None
    return None

def perguntar_continuar_ou_novo():
    memoria = carregar_memoria()

    if memoria:
        print(f"\n{'='*60}")
        print(f"ULTIMA TAREFA ENCONTRADA")
        print(f"{'='*60}")
        print(f"PDF: {memoria['caminho_pdf']}")
        print(f"Data: {memoria['data_execucao']}")
        print(f"Total de pessoas: {memoria['total_pessoas']}")
        print(f"\nPrimeiros nomes:")
        for nome in memoria['nomes'][:5]:
            print(f"  - {nome}")
        if len(memoria['nomes']) > 5:
            print(f"  ... e mais {len(memoria['nomes']) - 5} pessoas")

        print(f"\n{'='*60}")
        print(f"[1] Continuar com este PDF")
        print(f"[2] Iniciar nova tarefa")
        print(f"{'='*60}")

        escolha = input("\nEscolha (1 ou 2): ").strip()

        if escolha == "1":
            if os.path.exists(memoria['caminho_pdf']):
                print(f"\n[OK] Continuando com: {memoria['caminho_pdf']}")
                return memoria['caminho_pdf']
            else:
                print(f"\n[X] Arquivo nao encontrado: {memoria['caminho_pdf']}")
                print(f"[!] Iniciando nova tarefa...")
                return None
        else:
            print(f"\n[OK] Iniciando nova tarefa...")
            return None

    return None

def extrair_dados_edital_pdf(caminho_pdf):
    print(f"\n{'='*60}")
    print(f"EXTRAINDO DADOS DO EDITAL PDF")
    print(f"{'='*60}")
    print(f"Arquivo: {caminho_pdf}")

    dados = []

    try:
        with open(caminho_pdf, 'rb') as arquivo:
            leitor = PyPDF2.PdfReader(arquivo)
            texto_completo = ""

            for pagina in leitor.pages:
                texto_completo += pagina.extract_text()

            print(f"\n[DEBUG] Primeiras 500 caracteres do PDF:")
            print(texto_completo[:500])
            print(f"\n{'='*60}\n")

            linhas = texto_completo.split('\n')

            publicacao = None
            for linha in linhas[:20]:
                if 'PUBLICADO' in linha.upper() or 'PUBLICAÇÃO' in linha.upper():
                    data_match = re.search(r'(\d{2}/\d{2}/\d{4})', linha)
                    if data_match:
                        publicacao = data_match.group(1)
                        print(f"[INFO] Data de publicacao encontrada: {publicacao}")
                        break

            for i, linha in enumerate(linhas):
                renach_match = re.search(r'(\d{11})', linha)

                if renach_match:
                    renach = renach_match.group(1)

                    nome_match = re.search(r'([A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜ\s]{5,})', linha)

                    todos_numeros = re.findall(r'\d+', linha)
                    processo = None
                    for num in todos_numeros:
                        if len(num) >= 7 and num != renach:
                            processo = num
                            break

                    if not processo:
                        processo = "N/A"

                    penalidade = "N/A"
                    linha_upper = linha.upper()
                    if 'SUSPENSÃO' in linha_upper or 'SUSPENSAO' in linha_upper:
                        penalidade = "SUSPENSÃO"
                    elif 'CASSAÇÃO' in linha_upper or 'CASSACAO' in linha_upper:
                        penalidade = "CASSAÇÃO"
                    elif 'MULTA' in linha_upper:
                        penalidade = "MULTA"
                    elif 'ADVERTÊNCIA' in linha_upper or 'ADVERTENCIA' in linha_upper:
                        penalidade = "ADVERTÊNCIA"

                    if i > 0:
                        linha_anterior = linhas[i-1].upper()
                        if 'SUSPENSÃO' in linha_anterior or 'SUSPENSAO' in linha_anterior:
                            penalidade = "SUSPENSÃO"
                        elif 'CASSAÇÃO' in linha_anterior or 'CASSACAO' in linha_anterior:
                            penalidade = "CASSAÇÃO"

                    if nome_match:
                        nome = nome_match.group(1).strip()

                        if len(nome) > 5 and nome not in [d['nome'] for d in dados]:
                            dados.append({
                                'publicacao': publicacao or "N/A",
                                'nome': nome,
                                'renach': renach,
                                'processo': processo,
                                'penalidade': penalidade
                            })
                            print(f"  [+] {nome}")
                            print(f"      Publicacao: {publicacao or 'N/A'}")
                            print(f"      RENACH: {renach}")
                            print(f"      Processo: {processo}")
                            print(f"      Penalidade: {penalidade}")

    except Exception as e:
        print(f"[X] ERRO ao ler PDF: {e}")

    print(f"\n[OK] Total de pessoas encontradas: {len(dados)}")
    return dados

def conectar_chrome_debug():
    print(f"\n{'='*60}")
    print(f"CONECTANDO AO CHROME EM MODO DEBUG")
    print(f"{'='*60}")
    
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        print("[OK] Conectado ao Chrome!")
        return driver
    except Exception as e:
        print(f"[X] ERRO ao conectar: {e}")
        print("\nCertifique-se de que o Chrome esta rodando com:")
        print("  iniciar_chrome_debug.bat")
        return None

def abrir_pesquisas_mind7(driver, dados_edital):
    print(f"\n{'='*60}")
    print(f"ABRINDO PESQUISAS NO MIND-7")
    print(f"{'='*60}")

    print(f"\n[!] IMPORTANTE: Faca login no mind-7.org AGORA")
    print(f"[!] Acesse: https://mind-7.org")
    print(f"[!] Faca o login completo")

    input("\nPressione ENTER apos fazer login no mind-7.org...")

    print(f"\n[OK] Iniciando pesquisas...")

    url_pesquisa = "https://mind-7.org/painel/consultas/nome_v2/"

    abas_criadas = []

    for idx, pessoa in enumerate(dados_edital, 1):
        try:
            print(f"\n[{idx}/{len(dados_edital)}] Pesquisando: {pessoa['nome']}")

            driver.execute_script("window.open('');")
            driver.switch_to.window(driver.window_handles[-1])

            driver.get(url_pesquisa)
            time.sleep(2)

            campo_nome = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "nome"))
            )
            campo_nome.clear()
            campo_nome.send_keys(pessoa['nome'])

            botao_buscar = driver.find_element(By.XPATH, "//button[@type='submit' or contains(text(), 'Buscar') or contains(text(), 'Pesquisar')]")
            botao_buscar.click()

            time.sleep(3)

            abas_criadas.append({
                'handle': driver.current_window_handle,
                'pessoa': pessoa,
                'indice': idx
            })

            print(f"  [OK] Aba criada - aguardando clique manual no CPF")

        except Exception as e:
            print(f"  [X] ERRO: {e}")
            print(f"  [!] Pesquise manualmente nesta aba: {pessoa['nome']}")

            abas_criadas.append({
                'handle': driver.current_window_handle,
                'pessoa': pessoa,
                'indice': idx
            })

    print(f"\n[OK] Total de abas criadas: {len(abas_criadas)}")
    return abas_criadas

def aguardar_clique_manual_cpf(driver, aba_info):
    print(f"\n{'='*60}")
    print(f"AGUARDANDO CLIQUE MANUAL NO CPF")
    print(f"{'='*60}")
    print(f"Pessoa: {aba_info['pessoa']['nome']}")
    print(f"Aba: {aba_info['indice']}")
    
    driver.switch_to.window(aba_info['handle'])
    
    url_inicial = driver.current_url
    print(f"\nURL inicial: {url_inicial}")
    print(f"\n[!] CLIQUE NO CPF DA PESSOA NA ABA DO NAVEGADOR")
    print(f"[!] Aguardando mudanca de URL...")
    
    timeout = 300
    tempo_inicio = time.time()
    
    while time.time() - tempo_inicio < timeout:
        try:
            url_atual = driver.current_url
            
            if url_atual != url_inicial and "cpf" in url_atual.lower():
                print(f"\n[OK] CPF clicado! Nova URL detectada")
                print(f"URL: {url_atual}")
                time.sleep(2)
                return True
            
            time.sleep(1)
        
        except:
            pass
    
    print(f"\n[X] TIMEOUT - Nenhum clique detectado em {timeout}s")
    return False

def extrair_dados_pagina_cpf(driver):
    print(f"\n{'='*60}")
    print(f"EXTRAINDO DADOS DA PAGINA CPF")
    print(f"{'='*60}")
    
    dados = {
        'cpf': None,
        'telefone': None,
        'celular': None,
        'email': None,
        'whatsapp_valido': None
    }
    
    try:
        texto_pagina = driver.page_source
        
        cpf_match = re.search(r'CPF[:\s]*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})', texto_pagina, re.IGNORECASE)
        if cpf_match:
            dados['cpf'] = cpf_match.group(1)
            print(f"  CPF: {dados['cpf']}")
        
        telefone_matches = re.findall(r'(?:Telefone|Tel|Fone)[:\s]*(\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4})', texto_pagina, re.IGNORECASE)
        if telefone_matches:
            dados['telefone'] = telefone_matches[0]
            print(f"  Telefone: {dados['telefone']}")
        
        celular_matches = re.findall(r'(?:Celular|Cel)[:\s]*(\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4})', texto_pagina, re.IGNORECASE)
        if celular_matches:
            dados['celular'] = celular_matches[0]
            print(f"  Celular: {dados['celular']}")
        
        email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', texto_pagina)
        if email_match:
            dados['email'] = email_match.group(0)
            print(f"  Email: {dados['email']}")
        
        telefone_validar = dados['celular'] or dados['telefone']
        if telefone_validar:
            numeros = re.sub(r'\D', '', telefone_validar)
            if len(numeros) == 11 and numeros[2] == '9':
                dados['whatsapp_valido'] = numeros
                print(f"  [OK] WhatsApp valido: {dados['whatsapp_valido']}")
            else:
                print(f"  [X] WhatsApp invalido: {numeros}")
        
    except Exception as e:
        print(f"[X] ERRO ao extrair dados: {e}")
    
    return dados

def imprimir_e_salvar_pdf(driver, nome_pessoa, processo):
    print(f"\n{'='*60}")
    print(f"IMPRIMINDO E SALVANDO PDF")
    print(f"{'='*60}")
    
    try:
        nome_arquivo = f"PDF_{nome_pessoa.replace(' ', '_')}_{processo.replace('/', '-')}.pdf"
        print(f"Nome sugerido: {nome_arquivo}")
        
        print(f"\n[!] CLICANDO NO BOTAO IMPRIMIR...")
        
        try:
            botao_imprimir = driver.find_element(By.XPATH, "//button[contains(text(), 'Imprimir') or contains(@onclick, 'print')]")
            botao_imprimir.click()
        except:
            driver.execute_script("window.print();")
        
        time.sleep(3)
        
        print(f"\n[!] AGORA SALVE O PDF MANUALMENTE:")
        print(f"   1. Na janela de impressao, clique em 'Salvar como PDF'")
        print(f"   2. Escolha a pasta Downloads")
        print(f"   3. Use o nome: {nome_arquivo}")
        print(f"   4. Clique em Salvar")
        
        input(f"\nPressione ENTER apos salvar o PDF...")
        
        caminho_downloads = os.path.join(os.path.expanduser("~"), "Downloads", nome_arquivo)
        
        if os.path.exists(caminho_downloads):
            print(f"[OK] PDF salvo com sucesso!")
            return nome_arquivo
        else:
            print(f"[!] PDF nao encontrado em Downloads, mas continuando...")
            return nome_arquivo
    
    except Exception as e:
        print(f"[X] ERRO: {e}")
        return None

def processar_aba_completa(driver, aba_info):
    print(f"\n{'#'*60}")
    print(f"PROCESSANDO ABA {aba_info['indice']}/{aba_info.get('total', '?')}")
    print(f"{'#'*60}")
    print(f"Nome: {aba_info['pessoa']['nome']}")
    print(f"Processo: {aba_info['pessoa']['processo']}")
    print(f"RENACH: {aba_info['pessoa']['renach']}")
    print(f"Penalidade: {aba_info['pessoa']['penalidade']}")
    print(f"Publicacao: {aba_info['pessoa']['publicacao']}")

    resultado = {
        'nome': aba_info['pessoa']['nome'],
        'publicacao': aba_info['pessoa']['publicacao'],
        'processo': aba_info['pessoa']['processo'],
        'renach': aba_info['pessoa']['renach'],
        'cpf': None,
        'whatsapp': None,
        'pdf_salvo': None,
        'status': 'pendente'
    }
    
    if not aguardar_clique_manual_cpf(driver, aba_info):
        resultado['status'] = 'timeout_clique'
        return resultado
    
    dados_cpf = extrair_dados_pagina_cpf(driver)
    
    resultado['cpf'] = dados_cpf.get('cpf')
    resultado['whatsapp'] = dados_cpf.get('whatsapp_valido')
    
    if not resultado['whatsapp']:
        print(f"\n[X] WhatsApp invalido - pulando impressao de PDF")
        resultado['status'] = 'whatsapp_invalido'
        return resultado
    
    pdf_salvo = imprimir_e_salvar_pdf(driver, resultado['nome'], resultado['processo'])
    resultado['pdf_salvo'] = pdf_salvo
    resultado['status'] = 'concluido'
    
    return resultado

def gerar_relatorio_final(resultados, nome_arquivo="relatorio_final.json"):
    print(f"\n{'='*60}")
    print(f"GERANDO RELATORIO FINAL")
    print(f"{'='*60}")
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_json = f"relatorio_final_{timestamp}.json"
    nome_txt = f"relatorio_final_{timestamp}.txt"
    
    with open(nome_json, 'w', encoding='utf-8') as f:
        json.dump(resultados, f, indent=2, ensure_ascii=False)
    
    print(f"[OK] JSON salvo: {nome_json}")
    
    with open(nome_txt, 'w', encoding='utf-8') as f:
        f.write("="*60 + "\n")
        f.write("RELATORIO FINAL - AUTOMACAO MIND-7\n")
        f.write("="*60 + "\n\n")
        
        for idx, r in enumerate(resultados, 1):
            f.write(f"\n[{idx}] {r['nome']}\n")
            f.write(f"    Publicacao: {r.get('publicacao', 'N/A')}\n")
            f.write(f"    Processo: {r['processo']}\n")
            f.write(f"    CNH/RENACH: {r['renach']}\n")
            f.write(f"    Penalidade: {r.get('penalidade', 'N/A')}\n")
            f.write(f"    CPF: {r.get('cpf', 'N/A')}\n")
            f.write(f"    WhatsApp: {r.get('whatsapp', 'N/A')}\n")
            f.write(f"    PDF Salvo: {r.get('pdf_salvo', 'N/A')}\n")
            f.write(f"    Status: {r['status']}\n")
            f.write("-"*60 + "\n")
            f.write(f"    PDF Salvo: {r.get('pdf_salvo', 'N/A')}\n")
            f.write(f"    Status: {r['status']}\n")
            f.write("-"*60 + "\n")
    
    print(f"[OK] TXT salvo: {nome_txt}")
    
    print(f"\n{'='*60}")
    print(f"RESUMO FINAL")
    print(f"{'='*60}")
    
    for idx, r in enumerate(resultados, 1):
        print(f"\n[{idx}] {r['nome']}")
        print(f"    Processo: {r['processo']}")
        print(f"    CNH: {r['renach']}")
        print(f"    WhatsApp: {r.get('whatsapp', 'N/A')}")
        print(f"    PDF: {r.get('pdf_salvo', 'N/A')}")
        print(f"    Status: {r['status']}")

def main():
    print("\n" + "="*60)
    print("AUTOMACAO COMPLETA INTERATIVA - MIND-7")
    print("="*60)

    caminho_pdf = perguntar_continuar_ou_novo()

    if not caminho_pdf:
        caminho_pdf = input("\nCaminho do PDF do edital: ").strip().strip('"')

    if not os.path.exists(caminho_pdf):
        print(f"[X] Arquivo nao encontrado: {caminho_pdf}")
        return

    dados_edital = extrair_dados_edital_pdf(caminho_pdf)

    if not dados_edital:
        print("[X] Nenhum dado extraido do PDF")
        return

    salvar_memoria(caminho_pdf, dados_edital)

    print(f"\n[!] Certifique-se de que o Chrome esta rodando em modo debug")
    print(f"[!] Execute: iniciar_chrome_debug.bat")
    input("\nPressione ENTER quando estiver pronto...")

    driver = conectar_chrome_debug()

    if not driver:
        return

    abas_criadas = abrir_pesquisas_mind7(driver, dados_edital)

    if not abas_criadas:
        print("[X] Nenhuma aba criada")
        return

    for aba in abas_criadas:
        aba['total'] = len(abas_criadas)

    resultados = []

    for aba_info in abas_criadas:
        resultado = processar_aba_completa(driver, aba_info)
        resultados.append(resultado)

    gerar_relatorio_final(resultados)

    print(f"\n{'='*60}")
    print(f"AUTOMACAO CONCLUIDA!")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
