# -*- coding: utf-8 -*-
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import re
import os
import PyPDF2

def conectar_chrome():
    print("\n[1] Conectando ao Chrome em modo debug...")
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        print(f"[OK] Conectado! Abas abertas: {len(driver.window_handles)}")
        return driver
    except Exception as e:
        print(f"[X] Erro ao conectar: {e}")
        print("\n[!] SOLUCAO:")
        print("    1. Execute: INICIAR_CHROME.bat")
        print("    2. Faca login no Mind-7")
        print("    3. Execute este script novamente")
        return None

def extrair_nomes_pdf(caminho_pdf):
    print(f"\n[2] Lendo PDF: {caminho_pdf}")
    nomes = []
    
    try:
        with open(caminho_pdf, 'rb') as arquivo:
            leitor = PyPDF2.PdfReader(arquivo)
            print(f"    Total de paginas: {len(leitor.pages)}")
            
            for num_pagina, pagina in enumerate(leitor.pages, 1):
                texto = pagina.extract_text()
                linhas = texto.split('\n')
                
                for linha in linhas:
                    match = re.search(r'(\d{2}/\d{2}/\d{4})\s+([A-Z\s]+?)\s+(\d+)\s+(\d+)', linha)
                    if match:
                        nome = match.group(2).strip()
                        nomes.append(nome)
                
                print(f"    Pagina {num_pagina}: {len(nomes)} nomes extraidos")
        
        nomes_unicos = list(set(nomes))
        print(f"\n[OK] Total de nomes unicos: {len(nomes_unicos)}")
        return nomes_unicos
    
    except Exception as e:
        print(f"[X] Erro ao ler PDF: {e}")
        return []

def pesquisar_nomes_mind7(driver, nomes):
    print(f"\n[3] Abrindo {len(nomes)} pesquisas no Mind-7...")
    print("="*80)
    
    abas_abertas = 0
    
    for i, nome in enumerate(nomes, 1):
        try:
            url_consulta = "https://mind-7.org/painel/consultas/nome_v2/"
            driver.execute_script(f"window.open('{url_consulta}', '_blank');")
            time.sleep(1)
            
            nova_aba = driver.window_handles[-1]
            driver.switch_to.window(nova_aba)
            
            campo_nome = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "nome"))
            )
            
            campo_nome.clear()
            campo_nome.send_keys(nome)
            
            botao = driver.find_element(By.XPATH, "//button[@type='submit']")
            botao.click()
            
            time.sleep(2)
            
            abas_abertas += 1
            print(f"[{i}/{len(nomes)}] OK - {nome}")
            
        except Exception as e:
            print(f"[{i}/{len(nomes)}] ERRO - {nome}: {str(e)[:50]}")
    
    print("="*80)
    print(f"\n[OK] Concluido! {abas_abertas} abas abertas")
    print(f"[OK] Total de abas no navegador: {len(driver.window_handles)}")
    print("\nTodas as pesquisas estao em abas separadas para revisao manual.")

def main():
    print("="*80)
    print("AUTOMACAO SIMPLES - EDITAL > MIND-7")
    print("="*80)
    print("\nPRE-REQUISITOS:")
    print("  1. Execute: INICIAR_CHROME.bat")
    print("  2. Faca login no Mind-7")
    print("  3. Volte aqui")
    print("="*80)
    
    input("\nPressione ENTER quando estiver pronto...")
    
    driver = conectar_chrome()
    
    if not driver:
        input("\nPressione ENTER para sair...")
        return
    
    try:
        caminho_pdf = input("\nCaminho do PDF do edital: ").strip().strip('"')
        
        if not os.path.exists(caminho_pdf):
            print(f"\n[X] Arquivo nao encontrado: {caminho_pdf}")
            input("\nPressione ENTER para sair...")
            return
        
        nomes = extrair_nomes_pdf(caminho_pdf)
        
        if not nomes:
            print("\n[X] Nenhum nome extraido do PDF!")
            input("\nPressione ENTER para sair...")
            return
        
        print(f"\n[OK] {len(nomes)} nomes encontrados")
        confirmar = input("\nDeseja abrir todas as pesquisas? (S/N): ")
        
        if confirmar.upper() == 'S':
            pesquisar_nomes_mind7(driver, nomes)
        else:
            print("\n[!] Operacao cancelada")
        
        print("\n" + "="*80)
        print("PROCESSO FINALIZADO")
        print("="*80)
        print("\nRevise as abas abertas no navegador.")
        input("\nPressione ENTER para sair...")
    
    except KeyboardInterrupt:
        print("\n\n[!] Processo interrompido pelo usuario")
        input("\nPressione ENTER para sair...")
    
    except Exception as e:
        print(f"\n[X] Erro: {e}")
        import traceback
        traceback.print_exc()
        input("\nPressione ENTER para sair...")

if __name__ == "__main__":
    main()
