# -*- coding: utf-8 -*-
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def verificar_saude_navegador(driver):
    try:
        driver.current_url
        driver.window_handles
        return True
    except Exception as e:
        print(f"[X] Erro ao verificar saude: {e}")
        return False

def conectar_chrome_debug():
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    
    try:
        print("[!] Conectando ao Chrome em modo debug...")
        driver = webdriver.Chrome(options=chrome_options)
        
        if verificar_saude_navegador(driver):
            print("[OK] Conectado com sucesso!")
            print(f"[OK] URL atual: {driver.current_url}")
            return driver
        else:
            print("[X] Chrome nao esta respondendo")
            return None
    except Exception as e:
        print(f"[X] Erro ao conectar: {e}")
        return None

def testar_deteccao_resultado(driver):
    print("\n" + "="*80)
    print("TESTE DE DETECCAO DE RESULTADO")
    print("="*80)
    
    try:
        print("\n[!] Verificando se ha uma tabela na pagina atual...")
        
        try:
            driver.current_url
        except Exception as session_error:
            print(f"[X] ERRO: Sessao do navegador perdida!")
            print(f"[X] Detalhes: {session_error}")
            return False
        
        try:
            WebDriverWait(driver, 15).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            print("[OK] Pagina carregada")
        except:
            print("[!] Timeout aguardando carregamento")
        
        time.sleep(2)
        
        try:
            tabela = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "table.table"))
            )
            print("[OK] Tabela encontrada!")
            
            linhas = tabela.find_elements(By.TAG_NAME, "tr")
            linhas_dados = [l for l in linhas if l.find_elements(By.TAG_NAME, "td")]
            
            print(f"[OK] Total de linhas com dados: {len(linhas_dados)}")
            
            if not linhas_dados:
                print("[!] Resultado: SEM_RESULTADO")
            elif len(linhas_dados) == 1:
                print("[OK] Resultado: UNICO")
            else:
                print(f"[!] Resultado: MULTIPLO ({len(linhas_dados)} resultados)")
            
            return True
            
        except Exception as e:
            print(f"[X] Tabela nao encontrada: {e}")
            print("[!] Possivel resultado: SEM_RESULTADO ou pagina diferente")
            return False
            
    except Exception as e:
        erro_str = str(e)
        print(f"[X] Erro no teste: {erro_str}")
        
        if "invalid session" in erro_str.lower() or "session deleted" in erro_str.lower():
            print("[X] ERRO CRITICO: Navegador foi fechado!")
            return False
        
        return False

def main():
    print("="*80)
    print("TESTE DE CONEXAO E DETECCAO - MIND-7")
    print("="*80)
    print("\nPRE-REQUISITOS:")
    print("  1. Chrome deve estar aberto em modo debug (porta 9222)")
    print("  2. Voce deve estar logado no Mind-7")
    print("  3. Navegue ate uma pagina de resultado de pesquisa")
    print("="*80)
    
    input("\nPressione ENTER quando estiver pronto...")
    
    driver = conectar_chrome_debug()
    
    if not driver:
        print("\n[X] Nao foi possivel conectar ao Chrome")
        print("\nSOLUCAO:")
        print("  1. Execute: iniciar_chrome_debug.bat")
        print("  2. Acesse https://mind-7.org e faca login")
        print("  3. Execute este teste novamente")
        input("\nPressione ENTER para sair...")
        return
    
    print("\n[OK] Conexao estabelecida!")
    print("\nAgora vamos testar a deteccao de resultados...")
    print("Navegue ate uma pagina de pesquisa no Mind-7 e pressione ENTER")
    
    input("\nPressione ENTER para testar...")
    
    sucesso = testar_deteccao_resultado(driver)
    
    if sucesso:
        print("\n[OK] Teste concluido com sucesso!")
    else:
        print("\n[X] Teste falhou - verifique os erros acima")
    
    print("\n" + "="*80)
    print("TESTE FINALIZADO")
    print("="*80)
    
    input("\nPressione ENTER para sair...")

if __name__ == "__main__":
    main()
