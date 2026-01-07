from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time
import sys

def automatizar_consulta_nome():
    print("Conectando ao Chrome existente...")

    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    try:
        driver = webdriver.Chrome(options=chrome_options)
    except Exception as e:
        print(f"Erro ao conectar: {e}")
        print("\nCertifique-se de que o Chrome foi aberto com: .\\abrir_chrome.bat")
        sys.exit(1)

    try:
        print(f"Conectado! URL atual: {driver.current_url}")
        print(f"Titulo da pagina: {driver.title}")

        if "mind-7.org" not in driver.current_url:
            print("\nNavegando para a pagina de consultas...")
            driver.get("https://mind-7.org/painel/consultas/nome_v2/")
            time.sleep(3)

        print("\n" + "="*50)
        nome_pesquisa = input("Digite o nome para pesquisar: ")
        print("="*50)

        if not nome_pesquisa:
            print("Nome vazio! Encerrando...")
            return

        print(f"\nProcurando campo de pesquisa...")

        campo_nome = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "nome"))
        )

        print(f"Digitando o nome: {nome_pesquisa}")
        campo_nome.clear()
        campo_nome.send_keys(nome_pesquisa)

        print("Procurando botao de pesquisa...")
        botao_pesquisar = driver.find_element(By.XPATH, "//button[@type='submit']")
        botao_pesquisar.click()

        print("\n*** PESQUISA REALIZADA COM SUCESSO! ***\n")

        time.sleep(5)

        input("Pressione Enter para finalizar (o navegador continuara aberto)...")

    except Exception as e:
        print(f"\nErro: {e}")
        import traceback
        traceback.print_exc()
        input("\nPressione Enter para finalizar...")

if __name__ == "__main__":
    automatizar_consulta_nome()
