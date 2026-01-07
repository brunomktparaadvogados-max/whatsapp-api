from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import time

def testar_acesso_mind7():
    print("Iniciando navegador Chrome...")
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
    
    try:
        print("Acessando mind-7.org...")
        driver.get("https://mind-7.org/painel/consultas/nome_v2/")
        
        print("Aguardando carregamento da página...")
        time.sleep(5)
        
        print(f"Título da página: {driver.title}")
        print(f"URL atual: {driver.current_url}")
        print("\n✓ Acesso ao mind-7.org realizado com sucesso!")
        
        input("\nPressione Enter para fechar o navegador...")
        
    except Exception as e:
        print(f"✗ Erro ao acessar: {e}")
        input("\nPressione Enter para fechar...")
    
    finally:
        driver.quit()
        print("Navegador fechado.")

if __name__ == "__main__":
    testar_acesso_mind7()
