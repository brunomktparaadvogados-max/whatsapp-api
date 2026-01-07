# -*- coding: utf-8 -*-
import subprocess
import socket
import sys
import os
import platform

def print_header(text):
    print("\n" + "="*80)
    print(f"  {text}")
    print("="*80)

def print_ok(text):
    print(f"  [OK] {text}")

def print_error(text):
    print(f"  [X] {text}")

def print_warning(text):
    print(f"  [!] {text}")

def verificar_chrome_instalado():
    print_header("1. VERIFICANDO INSTALACAO DO CHROME")
    
    caminhos = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
    ]
    
    chrome_encontrado = False
    for caminho in caminhos:
        if os.path.exists(caminho):
            print_ok(f"Chrome encontrado: {caminho}")
            chrome_encontrado = True
            
            try:
                result = subprocess.run([caminho, "--version"], 
                                      capture_output=True, 
                                      text=True, 
                                      timeout=5)
                if result.stdout:
                    print_ok(f"Versao: {result.stdout.strip()}")
            except:
                print_warning("Nao foi possivel obter versao")
            
            break
    
    if not chrome_encontrado:
        print_error("Chrome nao encontrado!")
        print_warning("Instale o Google Chrome: https://www.google.com/chrome/")
        return False
    
    return True

def verificar_processos_chrome():
    print_header("2. VERIFICANDO PROCESSOS DO CHROME")
    
    try:
        if platform.system() == "Windows":
            result = subprocess.run(["tasklist", "/FI", "IMAGENAME eq chrome.exe"], 
                                  capture_output=True, 
                                  text=True)
            
            if "chrome.exe" in result.stdout:
                print_warning("Chrome esta rodando!")
                print_warning("Feche todos os Chrome antes de iniciar em modo debug")
                
                linhas = [l for l in result.stdout.split('\n') if 'chrome.exe' in l]
                print(f"\n  Processos encontrados: {len(linhas)}")
                return False
            else:
                print_ok("Nenhum processo Chrome rodando")
                return True
        else:
            result = subprocess.run(["pgrep", "-f", "chrome"], 
                                  capture_output=True, 
                                  text=True)
            if result.stdout.strip():
                print_warning("Chrome esta rodando!")
                return False
            else:
                print_ok("Nenhum processo Chrome rodando")
                return True
    except Exception as e:
        print_error(f"Erro ao verificar processos: {e}")
        return None

def verificar_porta_9222():
    print_header("3. VERIFICANDO PORTA 9222")
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        result = sock.connect_ex(('127.0.0.1', 9222))
        sock.close()
        
        if result == 0:
            print_ok("Porta 9222 esta ABERTA e ESCUTANDO")
            print_ok("Chrome debug parece estar rodando!")
            return True
        else:
            print_warning("Porta 9222 esta FECHADA")
            print_warning("Chrome debug NAO esta rodando")
            return False
    except Exception as e:
        print_error(f"Erro ao verificar porta: {e}")
        return False

def testar_conexao_debug():
    print_header("4. TESTANDO CONEXAO COM CHROME DEBUG")
    
    try:
        import urllib.request
        import json
        
        url = "http://127.0.0.1:9222/json"
        
        try:
            response = urllib.request.urlopen(url, timeout=5)
            data = json.loads(response.read().decode())
            
            print_ok(f"Conexao estabelecida!")
            print_ok(f"Abas abertas: {len(data)}")
            
            if data:
                print("\n  Primeira aba:")
                primeira = data[0]
                print(f"    Titulo: {primeira.get('title', 'N/A')[:50]}")
                print(f"    URL: {primeira.get('url', 'N/A')[:60]}")
            
            return True
            
        except urllib.error.URLError as e:
            print_error("Nao foi possivel conectar!")
            print_error(f"Erro: {e}")
            return False
            
    except ImportError:
        print_warning("urllib nao disponivel, pulando teste")
        return None

def testar_selenium():
    print_header("5. TESTANDO SELENIUM")
    
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        
        print_ok("Selenium instalado")
        
        try:
            chrome_options = Options()
            chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
            
            print("  Tentando conectar com Selenium...")
            driver = webdriver.Chrome(options=chrome_options)
            
            print_ok("Conexao Selenium estabelecida!")
            print_ok(f"URL atual: {driver.current_url[:60]}")
            
            driver.quit()
            return True
            
        except Exception as e:
            print_error(f"Erro ao conectar com Selenium: {str(e)[:100]}")
            return False
            
    except ImportError:
        print_error("Selenium nao instalado!")
        print_warning("Instale com: pip install selenium")
        return False

def verificar_firewall():
    print_header("6. VERIFICANDO FIREWALL")
    
    try:
        if platform.system() == "Windows":
            result = subprocess.run(
                ["netsh", "advfirewall", "firewall", "show", "rule", "name=all"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if "9222" in result.stdout:
                print_ok("Regra de firewall encontrada para porta 9222")
            else:
                print_warning("Nenhuma regra de firewall para porta 9222")
                print_warning("Pode ser necessario adicionar excecao")
        else:
            print_warning("Verificacao de firewall disponivel apenas no Windows")
            
    except Exception as e:
        print_warning(f"Nao foi possivel verificar firewall: {e}")

def gerar_relatorio():
    print_header("RELATORIO DE DIAGNOSTICO")
    
    print("\n  Sistema:")
    print(f"    OS: {platform.system()} {platform.release()}")
    print(f"    Python: {sys.version.split()[0]}")
    
    print("\n  Modulos Python:")
    modulos = ['selenium', 'PyPDF2']
    for modulo in modulos:
        try:
            __import__(modulo)
            print(f"    {modulo}: Instalado")
        except ImportError:
            print(f"    {modulo}: NAO instalado")

def main():
    print("="*80)
    print("  DIAGNOSTICO - AUTOMACAO MIND-7")
    print("="*80)
    print("\n  Este script vai verificar:")
    print("    1. Se o Chrome esta instalado")
    print("    2. Se ha processos Chrome rodando")
    print("    3. Se a porta 9222 esta aberta")
    print("    4. Se consegue conectar ao Chrome debug")
    print("    5. Se o Selenium funciona")
    print("    6. Configuracoes de firewall")
    print("\n" + "="*80)
    
    input("\nPressione ENTER para iniciar diagnostico...")
    
    resultados = {}
    
    resultados['chrome'] = verificar_chrome_instalado()
    resultados['processos'] = verificar_processos_chrome()
    resultados['porta'] = verificar_porta_9222()
    resultados['debug'] = testar_conexao_debug()
    resultados['selenium'] = testar_selenium()
    verificar_firewall()
    
    gerar_relatorio()
    
    print_header("RESUMO")
    
    if resultados['chrome'] and resultados['porta'] and resultados['debug'] and resultados['selenium']:
        print_ok("TUDO OK! Chrome debug esta funcionando corretamente!")
        print("\n  Proximo passo:")
        print("    python automacao_completa_duas_fases.py")
    
    elif resultados['chrome'] and not resultados['porta']:
        print_warning("Chrome instalado mas NAO esta em modo debug")
        print("\n  Solucao:")
        print("    1. Execute: iniciar_chrome_debug_novo.bat")
        print("    2. Aguarde mensagem de sucesso")
        print("    3. Execute este diagnostico novamente")
    
    elif not resultados['chrome']:
        print_error("Chrome NAO instalado!")
        print("\n  Solucao:")
        print("    1. Instale o Google Chrome")
        print("    2. Execute este diagnostico novamente")
    
    elif resultados['porta'] and not resultados['selenium']:
        print_warning("Chrome debug rodando mas Selenium nao conecta")
        print("\n  Solucao:")
        print("    1. Verifique versao do ChromeDriver")
        print("    2. Reinstale Selenium: pip install --upgrade selenium")
    
    else:
        print_warning("Problemas detectados - veja detalhes acima")
    
    print("\n" + "="*80)
    input("\nPressione ENTER para sair...")

if __name__ == "__main__":
    main()
