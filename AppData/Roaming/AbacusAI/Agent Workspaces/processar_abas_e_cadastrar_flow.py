# -*- coding: utf-8 -*-
import time
import re
import json
import urllib.parse
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
import PyPDF2

def extrair_dados_edital_pdf(caminho_pdf):
    caminho_pdf = urllib.parse.unquote(urllib.parse.unquote(caminho_pdf))
    
    print(f"\n{'='*80}")
    print(f"EXTRAINDO DADOS DO EDITAL")
    print(f"{'='*80}")
    print(f"Arquivo: {caminho_pdf}")
    
    dados = []
    
    try:
        with open(caminho_pdf, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            texto_completo = ""
            
            for page in pdf_reader.pages:
                texto_completo += page.extract_text()
            
            linhas = texto_completo.split('\n')
            
            for linha in linhas:
                match = re.search(r'(\d{2}/\d{2}/\d{4})\s+([A-Z][A-Z\s]+?)\s+(\d+)\s+(\d+)\s+(.+)', linha)
                
                if match:
                    data_pub = match.group(1)
                    nome = match.group(2).strip()
                    renach = match.group(3)
                    processo = match.group(4)
                    penalidade = match.group(5).strip()
                    
                    nome = ' '.join(nome.split())
                    
                    dados.append({
                        'nome': nome,
                        'renach': renach,
                        'processo': processo,
                        'penalidade': penalidade,
                        'data_publicacao': data_pub
                    })
                    
                    print(f"  OK {nome} | Processo: {processo}")
            
            print(f"\nTotal de registros extraidos: {len(dados)}")
            return dados
    
    except Exception as e:
        print(f"ERRO ao extrair PDF: {e}")
        return []

def extrair_dados_pagina_cpf(driver):
    try:
        time.sleep(2)
        
        dados = {
            'nome': None,
            'cpf': None,
            'telefone': None,
            'celular': None,
            'email': None,
            'endereco': None
        }
        
        texto_pagina = driver.page_source.upper()
        
        match_nome = re.search(r'NOME[:\s]*([A-Z\s]+?)(?:<|CPF|TELEFONE)', texto_pagina)
        if match_nome:
            dados['nome'] = match_nome.group(1).strip()
        
        match_cpf = re.search(r'(\d{3}\.\d{3}\.\d{3}-\d{2})', driver.page_source)
        if match_cpf:
            dados['cpf'] = match_cpf.group(1)
        
        match_tel = re.search(r'TELEFONE[:\s]*\(?(\d{2})\)?\s*(\d{4,5})-?(\d{4})', texto_pagina)
        if match_tel:
            dados['telefone'] = f"({match_tel.group(1)}) {match_tel.group(2)}-{match_tel.group(3)}"
        
        match_cel = re.search(r'CELULAR[:\s]*\(?(\d{2})\)?\s*(\d{5})-?(\d{4})', texto_pagina)
        if match_cel:
            dados['celular'] = f"({match_cel.group(1)}) {match_cel.group(2)}-{match_cel.group(3)}"
        
        if not dados['nome']:
            try:
                h1 = driver.find_element(By.TAG_NAME, "h1")
                dados['nome'] = h1.text.strip()
            except:
                pass
        
        return dados
    
    except Exception as e:
        print(f"  ERRO ao extrair dados: {e}")
        return None

def validar_whatsapp(telefone):
    if not telefone:
        return False, "Telefone nao encontrado"
    
    numeros = re.sub(r'\D', '', telefone)
    
    if len(numeros) != 11:
        return False, f"Telefone invalido (tem {len(numeros)} digitos, precisa 11)"
    
    if numeros[2] != '9':
        return False, "Nao e celular (3o digito nao e 9)"
    
    return True, f"55{numeros}"

def gerar_pdf_pagina(driver, nome, processo):
    try:
        nome_limpo = re.sub(r'[^\w\s-]', '', nome).replace(' ', '_')
        nome_arquivo = f"{nome_limpo}_PROCESSO_{processo}.pdf"
        
        print(f"    Gerando PDF: {nome_arquivo}")
        print(f"    Use Ctrl+P para salvar manualmente como: {nome_arquivo}")
        
        driver.execute_script("window.print();")
        time.sleep(3)
        
        return nome_arquivo
    
    except Exception as e:
        print(f"    ERRO ao gerar PDF: {e}")
        return None

def encontrar_processo_por_nome(nome, dados_edital):
    nome_limpo = ' '.join(nome.upper().split())
    
    for pessoa in dados_edital:
        nome_edital = ' '.join(pessoa['nome'].upper().split())
        if nome_limpo == nome_edital:
            return pessoa['processo']
    
    for pessoa in dados_edital:
        nome_edital = ' '.join(pessoa['nome'].upper().split())
        if nome_limpo in nome_edital or nome_edital in nome_limpo:
            return pessoa['processo']
    
    return None

def cadastrar_no_flow(driver, aba_flow, dados_pessoa, pdf_gerado):
    try:
        print(f"\n  >>> CADASTRANDO NO FLOW <<<")
        
        driver.switch_to.window(aba_flow)
        time.sleep(2)
        
        if "sistemaflow.lovable.app/whatsapp" not in driver.current_url:
            driver.get("https://sistemaflow.lovable.app/whatsapp")
            time.sleep(3)
        
        try:
            overlay = driver.find_element(By.CSS_SELECTOR, "div[data-state='open'][class*='bg-black']")
            driver.execute_script("arguments[0].remove();", overlay)
            print(f"    Overlay removido")
            time.sleep(1)
        except:
            pass

        try:
            botao_fechar_modal = driver.find_element(By.XPATH, "//button[contains(@aria-label, 'Close') or contains(@class, 'close')]")
            botao_fechar_modal.click()
            time.sleep(1)
        except:
            pass

        botao_adicionar = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//button[contains(text(), 'Adicionar') or contains(text(), 'adicionar')]"))
        )

        driver.execute_script("arguments[0].scrollIntoView(true);", botao_adicionar)
        time.sleep(0.5)

        driver.execute_script("arguments[0].click();", botao_adicionar)
        print(f"    Botao Adicionar clicado")
        time.sleep(2)

        campo_nome = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//input[@placeholder='Nome do contato' or contains(@name, 'nome')]"))
        )
        campo_nome.clear()
        campo_nome.send_keys(dados_pessoa['nome'])
        print(f"    Nome preenchido: {dados_pessoa['nome']}")
        time.sleep(0.5)

        campo_telefone = driver.find_element(By.XPATH, "//input[@placeholder='5511999999999' or contains(@name, 'telefone')]")
        campo_telefone.clear()
        campo_telefone.send_keys(dados_pessoa['whatsapp'])
        print(f"    Telefone preenchido: {dados_pessoa['whatsapp']}")
        time.sleep(0.5)

        if dados_pessoa.get('processo'):
            try:
                campo_processo = driver.find_element(By.XPATH, "//input[contains(@placeholder, 'Processo') or contains(@name, 'processo')]")
                campo_processo.clear()
                campo_processo.send_keys(dados_pessoa['processo'])
                print(f"    Processo preenchido: {dados_pessoa['processo']}")
                time.sleep(0.5)
            except:
                print(f"    Campo processo nao encontrado (opcional)")

        if pdf_gerado:
            try:
                input_arquivo = driver.find_element(By.XPATH, "//input[@type='file']")
                caminho_completo = f"C:\\Users\\55119\\AppData\\Roaming\\AbacusAI\\Agent Workspaces\\{pdf_gerado}"
                input_arquivo.send_keys(caminho_completo)
                time.sleep(2)
                print(f"    PDF anexado: {pdf_gerado}")
            except Exception as e:
                print(f"    AVISO: Nao foi possivel anexar PDF automaticamente")
                print(f"    Anexe manualmente: {pdf_gerado}")

        botao_salvar = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//button[contains(text(), 'Salvar') or contains(text(), 'Confirmar') or contains(text(), 'Enviar')]"))
        )

        driver.execute_script("arguments[0].scrollIntoView(true);", botao_salvar)
        time.sleep(0.5)

        driver.execute_script("arguments[0].click();", botao_salvar)
        print(f"    Botao Salvar clicado")
        time.sleep(3)

        print(f"    [OK] Cadastrado no Flow com sucesso!")
        return True

    except Exception as e:
        print(f"    [X] ERRO ao cadastrar no Flow: {e}")
        print(f"\n    MODO MANUAL ATIVADO:")
        print(f"    1. Clique em 'Adicionar'")
        print(f"    2. Nome: {dados_pessoa['nome']}")
        print(f"    3. Telefone: {dados_pessoa['whatsapp']}")
        print(f"    4. Processo: {dados_pessoa.get('processo', 'N/A')}")
        print(f"    5. Anexe: {pdf_gerado}")

        resposta = input("\n    Cadastrou manualmente? (s/n): ").strip().lower()
        return resposta == 's'

def processar_aba_cpf(driver, handle, indice, total, dados_edital, aba_flow):
    print(f"\n{'='*80}")
    print(f"ABA {indice}/{total}")
    print(f"{'='*80}")
    
    resultado = {
        'indice': indice,
        'nome': None,
        'cpf': None,
        'telefone': None,
        'whatsapp': None,
        'whatsapp_valido': False,
        'processo': None,
        'pdf_gerado': None,
        'cadastrado_flow': False,
        'status': 'pendente'
    }
    
    try:
        driver.switch_to.window(handle)
        time.sleep(1)
        
        url = driver.current_url
        print(f"URL: {url}")
        
        if "mind-7.org" not in url:
            print(f"[PULAR] Nao e uma aba do Mind-7")
            resultado['status'] = 'pulado'
            return resultado
        
        dados = extrair_dados_pagina_cpf(driver)
        
        if not dados or not dados['nome']:
            print(f"[X] Nao foi possivel extrair dados da pagina")
            resultado['status'] = 'erro_extracao'
            return resultado
        
        resultado['nome'] = dados['nome']
        resultado['cpf'] = dados['cpf']
        
        print(f"Nome: {dados['nome']}")
        print(f"CPF: {dados['cpf']}")
        
        telefone = dados['celular'] or dados['telefone']
        resultado['telefone'] = telefone
        
        print(f"Telefone: {telefone}")
        
        whatsapp_ok, whatsapp_numero = validar_whatsapp(telefone)
        resultado['whatsapp_valido'] = whatsapp_ok
        resultado['whatsapp'] = whatsapp_numero if whatsapp_ok else None
        
        if not whatsapp_ok:
            print(f"[X] WhatsApp INVALIDO: {whatsapp_numero}")
            resultado['status'] = 'whatsapp_invalido'
            print(f"[DESCARTADO] Fechando aba...")
            driver.close()
            return resultado
        
        print(f"[OK] WhatsApp VALIDO: {whatsapp_numero}")
        
        processo = encontrar_processo_por_nome(dados['nome'], dados_edital)
        resultado['processo'] = processo
        
        if processo:
            print(f"Processo encontrado: {processo}")
        else:
            print(f"[!] Processo nao encontrado no edital")
        
        driver.switch_to.window(handle)
        pdf_nome = gerar_pdf_pagina(driver, dados['nome'], processo or "SEM_PROCESSO")
        resultado['pdf_gerado'] = pdf_nome
        
        time.sleep(2)
        
        sucesso_cadastro = cadastrar_no_flow(driver, aba_flow, resultado, pdf_nome)
        resultado['cadastrado_flow'] = sucesso_cadastro
        
        if sucesso_cadastro:
            resultado['status'] = 'sucesso'
            print(f"\n[OK] PROCESSADO COM SUCESSO!")
            print(f"Fechando aba do Mind-7...")
            driver.switch_to.window(handle)
            driver.close()
        else:
            resultado['status'] = 'erro_cadastro'
        
        time.sleep(1)
        
    except Exception as e:
        print(f"[X] ERRO ao processar aba: {e}")
        resultado['status'] = 'erro'
    
    return resultado

def main():
    print("\n" + "="*80)
    print("PROCESSAR ABAS E CADASTRAR NO FLOW")
    print("="*80)
    print("\nEste script vai:")
    print("1. Extrair dados do PDF do edital")
    print("2. Processar cada aba do Mind-7 aberta")
    print("3. Validar WhatsApp")
    print("4. Gerar PDF (apenas WhatsApp valido)")
    print("5. Cadastrar no Flow")
    print("6. Fechar aba processada")
    print("="*80)
    
    caminho_pdf = input("\nCaminho do PDF do edital: ").strip().strip('"')
    
    dados_edital = extrair_dados_edital_pdf(caminho_pdf)
    
    if not dados_edital:
        print("\n[X] Nenhum dado extraido do PDF!")
        input("\nPressione ENTER para sair...")
        return
    
    print(f"\n[OK] {len(dados_edital)} pessoas encontradas no edital")
    
    input("\nPressione ENTER para continuar...")
    
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        print("\n[OK] Conectado ao navegador!")
    except Exception as e:
        print(f"\n[X] Erro ao conectar: {e}")
        input("\nPressione ENTER para sair...")
        return
    
    aba_flow = None
    for handle in driver.window_handles:
        driver.switch_to.window(handle)
        if "sistemaflow.lovable.app" in driver.current_url:
            aba_flow = handle
            print(f"[OK] Aba do Flow encontrada!")
            break
    
    if not aba_flow:
        print("\n[X] Aba do Flow nao encontrada!")
        print("Abra https://sistemaflow.lovable.app/whatsapp em uma aba")
        input("\nPressione ENTER para sair...")
        return
    
    todas_abas = driver.window_handles.copy()
    abas_mind7 = [h for h in todas_abas if h != aba_flow]
    
    total_abas = len(abas_mind7)
    print(f"\n[OK] Total de abas do Mind-7 para processar: {total_abas}")
    
    resultados = []
    
    for i, handle in enumerate(abas_mind7, 1):
        try:
            resultado = processar_aba_cpf(driver, handle, i, total_abas, dados_edital, aba_flow)
            resultados.append(resultado)
            
            abas_atuais = driver.window_handles
            if handle not in abas_atuais:
                print(f"Aba fechada com sucesso")
        except Exception as e:
            print(f"[X] Erro ao processar aba {i}: {e}")
        
        time.sleep(1)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    arquivo_resultado = f"resultado_cadastro_flow_{timestamp}.json"
    
    with open(arquivo_resultado, 'w', encoding='utf-8') as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)
    
    print(f"\n\n{'='*80}")
    print("RELATORIO FINAL")
    print(f"{'='*80}")
    
    total = len(resultados)
    sucesso = len([r for r in resultados if r['status'] == 'sucesso'])
    whatsapp_invalido = len([r for r in resultados if r['status'] == 'whatsapp_invalido'])
    erros = len([r for r in resultados if 'erro' in r['status']])
    
    print(f"\nTotal processado: {total}")
    print(f"[OK] Cadastrados com sucesso: {sucesso}")
    print(f"[X] WhatsApp invalido (descartados): {whatsapp_invalido}")
    print(f"[X] Erros: {erros}")
    
    print(f"\nRelatorio salvo em: {arquivo_resultado}")
    print(f"{'='*80}\n")
    
    print(f"\nAbas restantes: {len(driver.window_handles)}")
    print(f"Deve sobrar apenas a aba do Flow!")
    
    input("\nPressione ENTER para sair...")

if __name__ == "__main__":
    main()
