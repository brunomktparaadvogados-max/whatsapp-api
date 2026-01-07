from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import time

def conectar_chrome_existente():
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    
    service = Service()
    driver = webdriver.Chrome(service=service, options=chrome_options)
    return driver

def observar_clique_cpf(driver):
    """Observa onde o usuário clica e captura o seletor"""
    print("\n=== MODO OBSERVAÇÃO ===")
    print("Vou observar você clicar no link do CPF")
    print("\nPasso 1: Vá até a página de resultados do Mind7")
    input("Pressione ENTER quando estiver na página de resultados...")
    
    # Captura estado ANTES do clique
    print("\nCapturando página ANTES do clique...")
    url_antes = driver.current_url
    
    # Busca TODOS os links da página
    todos_links = driver.find_elements(By.TAG_NAME, "a")
    print(f"\n[DEBUG] Total de links na página: {len(todos_links)}")
    
    # Mostra os primeiros 10 links
    print("\n[DEBUG] Primeiros links encontrados:")
    for i, link in enumerate(todos_links[:10]):
        href = link.get_attribute('href')
        texto = link.text.strip()
        print(f"  {i+1}. Texto: '{texto}' | Href: {href}")
    
    # Busca especificamente links com CPF
    links_com_cpf = []
    for link in todos_links:
        href = link.get_attribute('href') or ""
        texto = link.text.strip()
        
        if 'cpf' in href.lower() or 'documento' in href.lower():
            links_com_cpf.append({
                'elemento': link,
                'href': href,
                'texto': texto,
                'class': link.get_attribute('class'),
                'id': link.get_attribute('id')
            })
    
    print(f"\n[DEBUG] Links relacionados a CPF encontrados: {len(links_com_cpf)}")
    for i, link_info in enumerate(links_com_cpf):
        print(f"\n  Link {i+1}:")
        print(f"    Texto: '{link_info['texto']}'")
        print(f"    Href: {link_info['href']}")
        print(f"    Class: {link_info['class']}")
        print(f"    ID: {link_info['id']}")
    
    print("\n\nPasso 2: CLIQUE MANUALMENTE no link do CPF agora")
    input("Pressione ENTER após clicar...")
    
    time.sleep(2)
    
    # Captura estado DEPOIS do clique
    url_depois = driver.current_url
    
    print(f"\n[RESULTADO]")
    print(f"  URL antes: {url_antes}")
    print(f"  URL depois: {url_depois}")
    
    if url_antes != url_depois:
        print(f"\n✓ Redirecionamento detectado!")
        print(f"\nAgora vou tentar encontrar o link automaticamente...")
        
        # Volta para a página de resultados
        driver.back()
        time.sleep(3)
        
        # Tenta clicar automaticamente
        print("\nTentando clicar automaticamente...")
        
        if links_com_cpf:
            print(f"Tentando clicar no primeiro link de CPF encontrado...")
            try:
                links_com_cpf[0]['elemento'].click()
                time.sleep(2)
                print(f"✓ Clique automático funcionou!")
                print(f"URL atual: {driver.current_url}")
            except Exception as e:
                print(f"✗ Erro no clique automático: {e}")
    else:
        print(f"\n✗ Nenhum redirecionamento detectado")

def main():
    print("Conectando ao Chrome existente...")
    driver = conectar_chrome_existente()
    print("✓ Conectado!")
    
    observar_clique_cpf(driver)
    
    print("\n\nObservação concluída!")
    print("Mantenha o navegador aberto.")

if __name__ == "__main__":
    main()
