from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import time
import pandas as pd
from datetime import datetime

def configurar_navegador():
    chrome_options = Options()
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    
    return driver

def consultar_edital_mg(driver, cpf, data_validade, data_publicacao):
    print("\n=== CONSULTANDO EDITAL MG ===")
    driver.get("https://transito.mg.gov.br/infracoes/suspensao-do-direito-de-dirigir/consulta-de-editais-do-processo-de-suspensao")
    
    time.sleep(3)
    
    try:
        campo_cpf = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "cpf"))
        )
        campo_cpf.send_keys(cpf)
        
        campo_validade = driver.find_element(By.ID, "dataValidadeCnh")
        campo_validade.send_keys(data_validade)
        
        campo_publicacao = driver.find_element(By.ID, "dataPublicacao")
        campo_publicacao.send_keys(data_publicacao)
        
        botao_pesquisar = driver.find_element(By.XPATH, "//button[contains(text(), 'Pesquisar')]")
        botao_pesquisar.click()
        
        time.sleep(5)
        
        print("Resultado obtido!")
        return True
        
    except Exception as e:
        print(f"Erro ao consultar edital: {e}")
        return False

def consultar_mind7(driver, nome):
    print(f"\n=== CONSULTANDO MIND-7: {nome} ===")
    driver.get("https://mind-7.org/painel/consultas/nome_v2/")
    
    time.sleep(5)
    
    try:
        campo_nome = WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.ID, "nome"))
        )
        
        campo_nome.clear()
        campo_nome.send_keys(nome)
        
        botao = driver.find_element(By.XPATH, "//button[@type='submit']")
        botao.click()
        
        time.sleep(5)
        print("Consulta realizada!")
        return True
        
    except Exception as e:
        print(f"Erro ao consultar mind-7: {e}")
        return False

def main():
    print("="*60)
    print("AUTOMACAO DE CONSULTA DE EDITAIS E MIND-7")
    print("="*60)
    
    driver = configurar_navegador()
    
    try:
        print("\nEscolha a opcao:")
        print("1 - Consultar edital MG")
        print("2 - Consultar nome no Mind-7")
        print("3 - Fluxo completo (Edital + Mind-7)")
        
        opcao = input("\nOpcao: ")
        
        if opcao == "1":
            cpf = input("CPF: ")
            data_validade = input("Data validade CNH (dd/mm/aaaa): ")
            data_publicacao = input("Data publicacao (dd/mm/aaaa): ")
            consultar_edital_mg(driver, cpf, data_validade, data_publicacao)
            
        elif opcao == "2":
            driver.get("https://mind-7.org/painel/consultas/nome_v2/")
            print("\nResolva o Cloudflare se necessario...")
            time.sleep(30)
            nome = input("Nome para pesquisar: ")
            consultar_mind7(driver, nome)
            
        elif opcao == "3":
            print("\nFuncionalidade em desenvolvimento...")
            print("Em breve: ler editais automaticamente e consultar todos os nomes")
        
        input("\nPressione Enter para fechar...")
        
    except Exception as e:
        print(f"\nErro: {e}")
        import traceback
        traceback.print_exc()
        input("\nPressione Enter para fechar...")
    finally:
        driver.quit()

if __name__ == "__main__":
    main()
