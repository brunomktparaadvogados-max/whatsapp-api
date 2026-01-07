from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
import time
import re
import requests
import os
import PyPDF2
import concurrent.futures
from threading import Lock

print_lock = Lock()

def validar_whatsapp(numero):
    numero_limpo = re.sub(r'\D', '', numero)
    
    if len(numero_limpo) < 10:
        return False
    
    if not numero_limpo.startswith('55'):
        numero_limpo = '55' + numero_limpo
    
    try:
        response = requests.get(f"https://api.whatsapp.com/send?phone={numero_limpo}", timeout=5)
        return response.status_code == 200
    except:
        return len(numero_limpo) >= 12

def conectar_navegador_existente():
    print("Conectando ao navegador existente...")

    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    try:
        driver = webdriver.Chrome(options=chrome_options)
        print(f"Conectado! Abas abertas: {len(driver.window_handles)}")
        return driver
    except Exception as e:
        print(f"Erro ao conectar: {e}")
        print("\nCERTIFIQUE-SE DE:")
        print("1. Fechar todos os Chrome/Brave")
        print("2. Executar: .\\abrir_chrome_debug.bat")
        print("3. Fazer login no Mind-7 e Flow")
        return None

def verificar_lead_existe_flow(driver, nome):
    try:
        aba_flow = None
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            if "sistemaflow.lovable.app" in driver.current_url:
                aba_flow = handle
                break
        
        if not aba_flow:
            print("Aba do Flow nao encontrada!")
            return False
        
        driver.switch_to.window(aba_flow)
        time.sleep(1)
        
        elementos_nome = driver.find_elements(By.XPATH, f"//td[contains(text(), '{nome}')]")
        
        return len(elementos_nome) > 0
        
    except Exception as e:
        print(f"Erro ao verificar Flow: {e}")
        return False

def adicionar_lead_flow(driver, nome, telefone, processo):
    try:
        aba_flow = None
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            if "sistemaflow.lovable.app" in driver.current_url:
                aba_flow = handle
                break
        
        if not aba_flow:
            print("Aba do Flow nao encontrada!")
            return False
        
        driver.switch_to.window(aba_flow)
        time.sleep(1)
        
        botao_adicionar = driver.find_element(By.XPATH, "//button[contains(text(), 'Adicionar')]")
        botao_adicionar.click()
        time.sleep(2)
        
        campo_nome = driver.find_element(By.XPATH, "//input[@placeholder='Nome do Cliente' or @name='nome']")
        campo_nome.send_keys(nome)
        
        campo_telefone = driver.find_element(By.XPATH, "//input[@placeholder='Telefone' or @name='telefone']")
        campo_telefone.send_keys(telefone)
        
        campo_processo = driver.find_element(By.XPATH, "//input[@placeholder='Nº Processo' or @name='processo']")
        campo_processo.send_keys(processo)
        
        botao_salvar = driver.find_element(By.XPATH, "//button[contains(text(), 'Salvar') or contains(text(), 'Confirmar')]")
        botao_salvar.click()
        
        time.sleep(2)
        print(f"Lead adicionado: {nome}")
        return True
        
    except Exception as e:
        print(f"Erro ao adicionar no Flow: {e}")
        return False

def extrair_nome_processo_pdf_arquivo(caminho_pdf):
    try:
        print(f"Lendo PDF: {caminho_pdf}")
        dados = []

        with open(caminho_pdf, 'rb') as arquivo:
            leitor = PyPDF2.PdfReader(arquivo)
            print(f"Total de paginas: {len(leitor.pages)}")

            for num_pagina, pagina in enumerate(leitor.pages, 1):
                texto = pagina.extract_text()
                linhas = texto.split('\n')

                for linha in linhas:
                    match = re.search(r'(\d{2}/\d{2}/\d{4})\s+([A-Z\s]+?)\s+(\d+)\s+(\d+)', linha)

                    if match:
                        nome = match.group(2).strip()
                        processo = match.group(3)

                        dados.append({
                            'nome': nome,
                            'processo': processo,
                            'pagina': num_pagina
                        })

                print(f"Pagina {num_pagina}: {len([d for d in dados if d['pagina'] == num_pagina])} registros")

        print(f"\nTotal extraido: {len(dados)} registros")
        return dados

    except Exception as e:
        print(f"Erro ao ler PDF: {e}")
        return []

def abrir_consulta_mind7_em_aba(driver, nome, aba_mind7):
    try:
        driver.switch_to.window(aba_mind7)
        
        url_consulta = f"https://mind-7.org/painel/consultas/nome_v2/"
        driver.execute_script(f"window.open('{url_consulta}', '_blank');")
        time.sleep(2)
        
        nova_aba = driver.window_handles[-1]
        driver.switch_to.window(nova_aba)
        
        campo_nome = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "nome"))
        )
        
        campo_nome.clear()
        campo_nome.send_keys(nome)
        
        botao = driver.find_element(By.XPATH, "//button[@type='submit']")
        botao.click()
        
        time.sleep(4)
        
        return nova_aba
        
    except Exception as e:
        with print_lock:
            print(f"Erro ao abrir consulta para {nome}: {e}")
        return None

def processar_resultado_aba(driver, aba, nome):
    try:
        driver.switch_to.window(aba)
        
        links_cpf = driver.find_elements(By.XPATH, "//a[contains(@href, '/painel/consultas/cpf/?documento=')]")
        
        if len(links_cpf) == 0:
            with print_lock:
                print(f"  [{nome}] Nenhum resultado")
            return None
        
        if len(links_cpf) > 1:
            with print_lock:
                print(f"  [{nome}] Multiplos resultados - PULANDO")
            return None
        
        cpf_url = links_cpf[0].get_attribute('href')
        driver.get(cpf_url)
        time.sleep(3)
        
        telefones = []
        elementos_telefone = driver.find_elements(By.XPATH, "//td[contains(text(), '(') and contains(text(), ')')]")
        
        for elem in elementos_telefone:
            tel = elem.text.strip()
            tel_limpo = re.sub(r'\D', '', tel)
            if len(tel_limpo) >= 10:
                telefones.append(tel_limpo)
        
        if not telefones:
            with print_lock:
                print(f"  [{nome}] Sem telefone")
            return None
        
        telefone_valido = None
        for tel in telefones:
            if validar_whatsapp(tel):
                telefone_valido = tel
                with print_lock:
                    print(f"  [{nome}] WhatsApp VALIDO: {tel}")
                break
        
        return telefone_valido
        
    except Exception as e:
        with print_lock:
            print(f"  [{nome}] Erro: {e}")
        return None

def consultar_mind7_multiplas_abas(driver, pessoas):
    print("\n" + "="*60)
    print("ABRINDO CONSULTAS EM MULTIPLAS ABAS")
    print("="*60)
    
    aba_mind7 = None
    for handle in driver.window_handles:
        driver.switch_to.window(handle)
        if "mind-7.org" in driver.current_url:
            aba_mind7 = handle
            break
    
    if not aba_mind7:
        print("Aba do Mind-7 nao encontrada!")
        return {}
    
    abas_consulta = {}
    
    print(f"\nAbrindo {len(pessoas)} consultas simultaneamente...")
    for pessoa in pessoas:
        nome = pessoa['nome']
        with print_lock:
            print(f"  Abrindo aba para: {nome}")
        
        aba = abrir_consulta_mind7_em_aba(driver, nome, aba_mind7)
        if aba:
            abas_consulta[nome] = {
                'aba': aba,
                'pessoa': pessoa
            }
        time.sleep(1)
    
    print(f"\n{len(abas_consulta)} abas abertas. Processando resultados...")
    
    resultados = {}
    for nome, info in abas_consulta.items():
        with print_lock:
            print(f"\nProcessando: {nome}")
        
        telefone = processar_resultado_aba(driver, info['aba'], nome)
        
        if telefone:
            resultados[nome] = {
                'telefone': telefone,
                'processo': info['pessoa']['processo']
            }
        
        driver.close()
        driver.switch_to.window(aba_mind7)
    
    print(f"\nResultados: {len(resultados)} telefones validos encontrados")
    return resultados

def processar_edital_automatico(driver, caminho_pdf):
    print("\n" + "="*60)
    print("PROCESSAMENTO AUTOMATICO - EDITAL -> MIND-7 -> FLOW")
    print("="*60)

    print("\nExtraindo dados do PDF...")
    dados_edital = extrair_nome_processo_pdf_arquivo(caminho_pdf)

    if not dados_edital:
        print("Nenhum dado extraido!")
        return

    print(f"\nTotal de registros: {len(dados_edital)}")
    
    print("\nVerificando quais leads ja existem no Flow...")
    pessoas_para_processar = []
    for pessoa in dados_edital:
        if not verificar_lead_existe_flow(driver, pessoa['nome']):
            pessoas_para_processar.append(pessoa)
        else:
            print(f"  {pessoa['nome']} - JA EXISTE no Flow")
    
    print(f"\n{len(pessoas_para_processar)} pessoas para processar")
    
    if not pessoas_para_processar:
        print("\nTodos os leads ja existem no Flow!")
        return
    
    resultados = consultar_mind7_multiplas_abas(driver, pessoas_para_processar)
    
    print("\n" + "="*60)
    print("ADICIONANDO LEADS NO FLOW")
    print("="*60)
    
    adicionados = 0
    pulados = 0
    
    for nome, dados in resultados.items():
        print(f"\nAdicionando: {nome}")
        if adicionar_lead_flow(driver, nome, dados['telefone'], dados['processo']):
            adicionados += 1
            print(f"  -> ADICIONADO!")
        else:
            pulados += 1
            print(f"  -> ERRO ao adicionar")
        time.sleep(2)

    print("\n" + "="*60)
    print(f"PROCESSAMENTO CONCLUIDO!")
    print(f"Adicionados: {adicionados}")
    print(f"Pulados: {pulados}")
    print("="*60)

def main():
    print("="*60)
    print("AUTOMACAO INTEGRADA - EDITAL + MIND-7 + FLOW")
    print("MODO: MULTIPLAS ABAS SIMULTANEAS")
    print("="*60)

    driver = conectar_navegador_existente()

    if not driver:
        print("\nNao foi possivel conectar ao navegador!")
        print("\nPasso a passo:")
        print("1. Feche todos os navegadores")
        print("2. Execute: .\\abrir_chrome_debug.bat")
        print("3. Faca login no Mind-7")
        print("4. Abra o Flow em outra aba")
        print("5. Execute este script novamente")
        input("\nPressione Enter para sair...")
        return

    try:
        caminho_pdf = input("\nCaminho completo do PDF do edital: ")

        if not os.path.exists(caminho_pdf):
            print(f"\nArquivo nao encontrado: {caminho_pdf}")
            input("\nPressione Enter para sair...")
            return

        processar_edital_automatico(driver, caminho_pdf)
        input("\nPressione Enter para finalizar...")

    except Exception as e:
        print(f"\nErro: {e}")
        import traceback
        traceback.print_exc()
        input("\nPressione Enter para finalizar...")

if __name__ == "__main__":
    main()
