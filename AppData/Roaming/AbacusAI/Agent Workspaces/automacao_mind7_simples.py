from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import time

def automatizar_consulta():
    print("Iniciando navegador Chrome...")

    chrome_options = Options()
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)

    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    try:
        print("Acessando mind-7.org...")
        driver.get("https://mind-7.org/painel/consultas/nome_v2/")

        print("\n" + "="*60)
        print("AGUARDE: Resolva o Cloudflare manualmente se aparecer")
        print("Voce tem 30 segundos...")
        print("="*60 + "\n")

        time.sleep(30)

        nome = input("Digite o nome para pesquisar: ")

        print(f"\nProcurando campo de nome...")
        campo_nome = WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.ID, "nome"))
        )

        print(f"Preenchendo: {nome}")
        campo_nome.clear()
        campo_nome.send_keys(nome)

        print("Clicando em pesquisar...")
        botao = driver.find_element(By.XPATH, "//button[@type='submit']")
        botao.click()

        print("\n" + "="*60)
        print("PESQUISA CONCLUIDA COM SUCESSO!")
        print("="*60 + "\n")

        time.sleep(5)
        input("Pressione Enter para fechar o navegador...")

    except Exception as e:
        print(f"\nErro: {e}")
        import traceback
        traceback.print_exc()
        input("\nPressione Enter para fechar...")
    finally:
        driver.quit()
        print("Navegador fechado.")

if __name__ == "__main__":
    automatizar_consulta()
