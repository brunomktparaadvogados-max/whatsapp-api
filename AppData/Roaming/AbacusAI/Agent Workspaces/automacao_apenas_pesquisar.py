from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import re
import os
import PyPDF2

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
        return None

def extrair_nomes_pdf(caminho_pdf):
    try:
        print(f"\nLendo PDF: {caminho_pdf}")
        nomes = []
        
        with open(caminho_pdf, 'rb') as arquivo:
            leitor = PyPDF2.PdfReader(arquivo)
            print(f"Total de páginas: {len(leitor.pages)}")
            
            for num_pagina, pagina in enumerate(leitor.pages, 1):
                texto = pagina.extract_text()
                linhas = texto.split('\n')
                
                for linha in linhas:
                    match = re.search(r'(\d{2}/\d{2}/\d{4})\s+([A-Z\s]+?)\s+(\d+)\s+(\d+)', linha)
                    if match:
                        nome = match.group(2).strip()
                        nomes.append(nome)
                
                print(f"Página {num_pagina}: {len([n for n in nomes])} nomes extraídos até agora")
        
        nomes_unicos = list(set(nomes))
        print(f"\nTotal de nomes únicos: {len(nomes_unicos)}")
        return nomes_unicos
    
    except Exception as e:
        print(f"Erro ao ler PDF: {e}")
        return []

def abrir_pesquisas_mind7(driver, nomes):
    print("\n" + "="*60)
    print(f"ABRINDO {len(nomes)} PESQUISAS NO MIND-7")
    print("="*60)
    
    print(f"\nIniciando pesquisas...\n")

    abas_abertas = 0
    abas_criadas = []

    for i, nome in enumerate(nomes, 1):
        try:
            url_consulta = "https://mind-7.org/painel/consultas/nome_v2/"
            driver.execute_script(f"window.open('{url_consulta}', '_blank');")
            time.sleep(2)

            nova_aba = driver.window_handles[-1]
            abas_criadas.append(nova_aba)
            driver.switch_to.window(nova_aba)

            campo_nome = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "nome"))
            )

            campo_nome.clear()
            campo_nome.send_keys(nome)

            botao = driver.find_element(By.XPATH, "//button[@type='submit']")
            botao.click()

            time.sleep(3)

            abas_abertas += 1
            print(f"[{i}/{len(nomes)}] ✓ {nome} - Aba {i} mantida aberta")

            time.sleep(0.5)

        except Exception as e:
            print(f"[{i}/{len(nomes)}] ✗ Erro ao pesquisar {nome}: {e}")

    print("\n" + "="*60)
    print(f"CONCLUÍDO!")
    print(f"Total de abas abertas: {abas_abertas}")
    print(f"Total de abas no navegador: {len(driver.window_handles)}")
    print("="*60)
    print("\n✅ Todas as abas foram mantidas abertas para análise!")
    print(f"✅ {len(abas_criadas)} pesquisas disponíveis para revisão")
    print("\nTodas as pesquisas estão em abas separadas.")
    print("Agora você pode revisar manualmente cada resultado.")

def main():
    print("="*60)
    print("AUTOMAÇÃO - APENAS PESQUISAR NOMES NO MIND-7")
    print("Modo: Múltiplas abas simultâneas")
    print("="*60)
    
    driver = conectar_navegador_existente()
    
    if not driver:
        print("\nNão foi possível conectar ao navegador!")
        print("\nCertifique-se de:")
        print("1. Chrome está aberto em modo debug")
        print("2. Você está logado no Mind-7")
        input("\nPressione Enter para sair...")
        return
    
    try:
        caminho_pdf = input("\nCaminho completo do PDF do edital: ")
        
        if not os.path.exists(caminho_pdf):
            print(f"\nArquivo não encontrado: {caminho_pdf}")
            input("\nPressione Enter para sair...")
            return
        
        nomes = extrair_nomes_pdf(caminho_pdf)
        
        if not nomes:
            print("\nNenhum nome extraído do PDF!")
            input("\nPressione Enter para sair...")
            return
        
        print(f"\nForam encontrados {len(nomes)} nomes no edital.")
        confirmar = input("\nDeseja abrir todas as pesquisas? (S/N): ")
        
        if confirmar.upper() == 'S':
            abrir_pesquisas_mind7(driver, nomes)
        else:
            print("\nOperação cancelada.")
        
        input("\nPressione Enter para finalizar...")
    
    except Exception as e:
        print(f"\nErro: {e}")
        import traceback
        traceback.print_exc()
        input("\nPressione Enter para finalizar...")

if __name__ == "__main__":
    main()
