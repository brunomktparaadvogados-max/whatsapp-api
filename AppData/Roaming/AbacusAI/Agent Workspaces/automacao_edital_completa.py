from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from webdriver_manager.chrome import ChromeDriverManager
import time
import pandas as pd
import PyPDF2
import re
from datetime import datetime
import os
import requests
from PIL import Image
import io
import base64
import threading
import urllib.parse

# Variável global para controlar pausa
pausado = False
continuar_processamento = True

def controlar_pausa():
    """Thread para monitorar comandos de pausa/continuar"""
    global pausado, continuar_processamento
    print("\n[CONTROLES]")
    print("  P = Pausar/Continuar")
    print("  S = Parar completamente")
    print("-" * 60)

    while continuar_processamento:
        comando = input().strip().upper()
        if comando == 'P':
            pausado = not pausado
            if pausado:
                print("\n⏸️  PAUSADO - Pressione P para continuar...")
            else:
                print("\n▶️  CONTINUANDO processamento...")
        elif comando == 'S':
            continuar_processamento = False
            pausado = False
            print("\n⏹️  PARANDO processamento...")
            break

def verificar_pausa():
    """Verifica se está pausado e aguarda"""
    global pausado, continuar_processamento
    while pausado and continuar_processamento:
        time.sleep(0.5)
    return continuar_processamento

def configurar_navegador_existente():
    """Conecta ao navegador Chrome já aberto com debugging"""
    print("\n" + "="*60)
    print("CONECTANDO AO NAVEGADOR EXISTENTE")
    print("="*60)
    print("\n✓ Chrome com debugging já está aberto")
    print("✓ Conectando às suas abas logadas...")

    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
        print("✓ Conectado ao navegador existente!")
        return driver
    except Exception as e:
        print(f"\n❌ Erro ao conectar: {e}")
        print("\nCertifique-se de que o Chrome foi aberto com --remote-debugging-port=9222")
        return None

def configurar_navegador():
    """Abre novo navegador Chrome"""
    chrome_options = Options()
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    chrome_options.add_argument('--start-maximized')

    prefs = {
        "download.default_directory": os.getcwd(),
        "download.prompt_for_download": False,
        "plugins.always_open_pdf_externally": True
    }
    chrome_options.add_experimental_option("prefs", prefs)

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    return driver

def extrair_texto_completo_pdf(caminho_pdf):
    """Extrai todo o texto do PDF incluindo detalhes do edital"""
    # Decodifica URL encoding (%20 -> espaço)
    caminho_pdf = urllib.parse.unquote(caminho_pdf)

    print(f"\nExtraindo texto completo do PDF: {caminho_pdf}")

    try:
        with open(caminho_pdf, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            texto_completo = ""

            for page in pdf_reader.pages:
                texto_completo += page.extract_text() + "\n"

            return texto_completo.strip()

    except Exception as e:
        print(f"Erro ao extrair texto do PDF: {e}")
        return ""

def extrair_dados_pdf(caminho_pdf):
    # Decodifica URL encoding (%20 -> espaço) duas vezes para garantir
    caminho_pdf = urllib.parse.unquote(urllib.parse.unquote(caminho_pdf))

    print(f"\nExtraindo dados estruturados do PDF: {caminho_pdf}")

    dados = []

    try:
        with open(caminho_pdf, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            texto_completo = ""

            for page in pdf_reader.pages:
                texto_completo += page.extract_text()

            linhas = texto_completo.split('\n')

            for linha in linhas:
                # Regex melhorado: captura nome completo até encontrar números
                # Padrão: DATA NOME_COMPLETO NUMERO NUMERO
                match = re.search(r'(\d{2}/\d{2}/\d{4})\s+([A-Z][A-Z\s]+?)\s+(\d+)\s+(\d+)', linha)

                if match:
                    data_pub = match.group(1)
                    nome = match.group(2).strip()
                    processo = match.group(3)
                    pontuacao = match.group(4)

                    # Remove espaços extras do nome
                    nome = ' '.join(nome.split())

                    print(f"  [DEBUG] Nome extraído: '{nome}'")

                    dados.append({
                        'data_publicacao': data_pub,
                        'nome': nome,
                        'processo': processo,
                        'pontuacao': pontuacao
                    })

            print(f"Total de registros extraidos: {len(dados)}")
            return dados

    except Exception as e:
        print(f"Erro ao extrair PDF: {e}")
        print(f"\nTentando caminho alternativo...")

        # Tenta remover apenas o %20
        caminho_alternativo = caminho_pdf.replace('%20', ' ')
        try:
            with open(caminho_alternativo, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                texto_completo = ""

                for page in pdf_reader.pages:
                    texto_completo += page.extract_text()

                linhas = texto_completo.split('\n')

                for linha in linhas:
                    match = re.search(r'(\d{2}/\d{2}/\d{4})\s+([A-Z][A-Z\s]+?)\s+(\d+)\s+(\d+)', linha)

                    if match:
                        data_pub = match.group(1)
                        nome = match.group(2).strip()
                        processo = match.group(3)
                        pontuacao = match.group(4)

                        # Remove espaços extras do nome
                        nome = ' '.join(nome.split())

                        print(f"  [DEBUG] Nome extraído: '{nome}'")

                        dados.append({
                            'data_publicacao': data_pub,
                            'nome': nome,
                            'processo': processo,
                            'pontuacao': pontuacao
                        })

                print(f"Total de registros extraidos: {len(dados)}")
                return dados
        except Exception as e2:
            print(f"Erro no caminho alternativo: {e2}")
            return []

def validar_whatsapp(numero):
    """Valida se o número está ativo no WhatsApp usando API gratuita"""
    try:
        numero_limpo = re.sub(r'\D', '', numero)

        if not numero_limpo.startswith('55'):
            numero_limpo = '55' + numero_limpo

        if len(numero_limpo) < 12:
            return False

        url = f"https://api.whatsapp.com/send?phone={numero_limpo}"

        response = requests.head(url, timeout=5, allow_redirects=True)

        if response.status_code == 200:
            print(f"  ✓ WhatsApp válido: {numero}")
            return True
        else:
            print(f"  ✗ WhatsApp inválido: {numero}")
            return False

    except Exception as e:
        print(f"  ? Erro ao validar {numero}: {e}")
        return False

def capturar_screenshot_mind7(driver, nome_arquivo):
    """Captura screenshot em alta resolução da página do Mind7"""
    try:
        original_size = driver.get_window_size()

        required_width = driver.execute_script('return document.body.parentNode.scrollWidth')
        required_height = driver.execute_script('return document.body.parentNode.scrollHeight')

        driver.set_window_size(required_width, required_height)

        time.sleep(2)

        screenshot = driver.get_screenshot_as_png()

        driver.set_window_size(original_size['width'], original_size['height'])

        with open(nome_arquivo, 'wb') as f:
            f.write(screenshot)

        print(f"  Screenshot salvo: {nome_arquivo}")
        return nome_arquivo

    except Exception as e:
        print(f"  Erro ao capturar screenshot: {e}")
        return None

def consultar_mind7_completo(driver, nome):
    """Consulta Mind7 e retorna dados completos incluindo WhatsApp válidos"""
    print(f"\n{'='*60}")
    print(f"Consultando Mind-7: {nome}")
    print('='*60)

    if not verificar_pausa():
        return None

    try:
        # Procura aba do Mind7 ou usa a primeira aba
        mind7_encontrado = False
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            if "mind-7" in driver.current_url:
                mind7_encontrado = True
                print("✓ Usando aba do Mind7 já aberta")
                break

        if not mind7_encontrado:
            print("⚠️ Usando primeira aba para Mind7...")
            driver.switch_to.window(driver.window_handles[0])

        driver.get("https://mind-7.org/painel/consultas/nome_v2/")
        time.sleep(3)

        if not verificar_pausa():
            return None

        campo_nome = WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.ID, "nome"))
        )

        campo_nome.clear()
        campo_nome.send_keys(nome)

        print(f"  Digitando nome: {nome}")

        botao = driver.find_element(By.XPATH, "//button[@type='submit']")
        botao.click()

        print(f"  Aguardando resultados...")
        time.sleep(6)

        if not verificar_pausa():
            return None

        try:
            # DEBUG: Salva screenshot da página de resultados
            try:
                driver.save_screenshot(f"debug_resultado_{nome.replace(' ', '_')}.png")
                print(f"  [DEBUG] Screenshot salvo: debug_resultado_{nome.replace(' ', '_')}.png")
            except:
                pass

            print(f"  [DEBUG] Procurando links de CPF...")

            # Aguarda a tabela de resultados carregar
            time.sleep(2)

            # CORRETO: Busca o botão com classe "btn btn-mind" que contém o CPF
            links_cpf = driver.find_elements(By.XPATH, "//a[contains(@class, 'btn-mind') and contains(@href, 'cpf/?documento=')]")
            print(f"  [DEBUG] Links de CPF encontrados (btn-mind): {len(links_cpf)}")

            # Alternativa: busca por qualquer link que aponte para cpf/?documento=
            if len(links_cpf) == 0:
                links_cpf = driver.find_elements(By.XPATH, "//a[contains(@href, 'cpf/?documento=')]")
                print(f"  [DEBUG] Links de CPF encontrados (href): {len(links_cpf)}")

            # DEBUG: Mostra informações dos links encontrados
            if len(links_cpf) > 0:
                print(f"  [DEBUG] Detalhes dos links encontrados:")
                for i, link in enumerate(links_cpf[:3]):  # Mostra até 3
                    print(f"    Link {i+1}:")
                    print(f"      Texto: '{link.text}'")
                    print(f"      Href: {link.get_attribute('href')}")
                    print(f"      Class: {link.get_attribute('class')}")

            # Se não encontrou links, retorna None (pula)
            if len(links_cpf) == 0:
                print(f"  ✗ Nenhum link de CPF encontrado para: {nome}")
                return None

            # Verifica quantos resultados foram encontrados
            elif len(links_cpf) > 1:
                print(f"  ✗ Múltiplos resultados encontrados ({len(links_cpf)}) para: {nome}")
                print(f"  Pulando para evitar ambiguidade...")
                return None

            else:
                # Exatamente 1 resultado encontrado
                print(f"  ✓ 1 resultado encontrado")

                link = links_cpf[0]
                href = link.get_attribute('href')

                # Extrai o CPF do link
                cpf_match = re.search(r'documento=(\d+)', href)
                if cpf_match:
                    cpf = cpf_match.group(1)
                    print(f"  CPF encontrado: {cpf}")
                else:
                    print(f"  ✗ Não foi possível extrair o CPF do link")
                    return None

                # Clica no link do CPF
                print(f"  Clicando no CPF...")

                try:
                    link.click()
                except:
                    # Se o clique normal falhar, tenta com JavaScript
                    print(f"  Tentando clique com JavaScript...")
                    driver.execute_script("arguments[0].click();", link)

                time.sleep(5)

                if not verificar_pausa():
                    return None

                # Verifica se foi redirecionado para a página do CPF
                url_atual = driver.current_url
                print(f"  [DEBUG] URL atual após clique: {url_atual}")

                if '/painel/consultas/cpf/' not in url_atual:
                    print(f"  ✗ Não foi redirecionado para a página do CPF")
                    return None

            try:
                link.click()
            except:
                # Se o clique normal falhar, tenta com JavaScript
                print(f"  Tentando clique com JavaScript...")
                driver.execute_script("arguments[0].click();", link)

            time.sleep(5)

            if not verificar_pausa():
                return None

            # Verifica se foi redirecionado para a página do CPF
            url_atual = driver.current_url
            print(f"  [DEBUG] URL atual após clique: {url_atual}")

            if '/painel/consultas/cpf/' not in url_atual:
                print(f"  ✗ Não foi redirecionado para a página do CPF")
                return None

            print(f"  ✓ Página do CPF carregada com sucesso")

            # Rola a página para carregar todo o conteúdo incluindo HISTÓRICO OPERADORAS
            print(f"  Rolando página para carregar todo o conteúdo...")
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(3)

            # Procura pela seção HISTÓRICO OPERADORAS e expande se necessário
            try:
                # Tenta encontrar e clicar em botões/links que expandem o histórico
                botoes_expandir = driver.find_elements(By.XPATH, "//*[contains(text(), 'HISTÓRICO') or contains(text(), 'OPERADORA') or contains(text(), 'Ver mais')]")
                for botao in botoes_expandir:
                    try:
                        botao.click()
                        time.sleep(1)
                        print(f"  ✓ Seção expandida")
                    except:
                        pass
            except:
                pass

            # Rola novamente após expandir
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
            driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(1)

            # Extrai telefones da página INTEIRA usando regex
            page_source = driver.page_source

            print(f"  Buscando telefones em toda a página (incluindo HISTÓRICO OPERADORAS)...")

            # Padrão: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
            telefones_encontrados = re.findall(r'\((\d{2})\)\s*(\d{4,5})-?(\d{4})', page_source)

            telefones_whatsapp = []
            telefones_unicos = set()

            for ddd, parte1, parte2 in telefones_encontrados:
                # Filtra apenas celulares (começam com 9 e tem 5 dígitos)
                if parte1.startswith('9') and len(parte1) == 5:
                    numero_completo = f"({ddd}) {parte1}-{parte2}"
                    numero_limpo = ddd + parte1 + parte2

                    # Evita duplicatas
                    if numero_limpo not in telefones_unicos:
                        telefones_unicos.add(numero_limpo)
                        telefones_whatsapp.append(numero_completo)

            print(f"  ✓ Telefones celulares encontrados: {len(telefones_whatsapp)}")
            for tel in telefones_whatsapp:
                print(f"    - {tel}")

            # Captura screenshot da página do CPF
            screenshot_path = capturar_screenshot_mind7(driver, f"mind7_{cpf}")

            return {
                'cpf': cpf,
                'telefones': telefones_whatsapp,
                'screenshot': screenshot_path
            }

        except Exception as e:
            print(f"  ✗ Erro ao processar resultado: {e}")
            import traceback
            traceback.print_exc()
            return None

    except Exception as e:
        print(f"  Erro ao consultar Mind-7: {e}")
        return None

def login_flow(driver):
    """Procura aba do Flow já logada"""
    print("\n" + "="*60)
    print("LOCALIZANDO ABA DO FLOW")
    print("="*60)

    if not verificar_pausa():
        return False

    # Procura aba do Flow já aberta
    flow_encontrado = False
    for handle in driver.window_handles:
        driver.switch_to.window(handle)
        if "sistemaflow" in driver.current_url:
            flow_encontrado = True
            print("✓ Aba do Flow encontrada e já logada!")
            break

    if not flow_encontrado:
        print("⚠️ Aba do Flow não encontrada!")
        print("Por favor, abra o Flow em uma aba do navegador e faça login.")
        print("Pressione ENTER quando estiver pronto...")
        input()

        # Tenta encontrar novamente
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            if "sistemaflow" in driver.current_url:
                flow_encontrado = True
                print("✓ Flow encontrado!")
                break

    return flow_encontrado

def adicionar_contato_flow(driver, nome, telefone, processo, screenshot_path, texto_edital):
    """Adiciona contato no Flow via automação web"""
    print(f"\n  Adicionando no Flow: {nome} - {telefone}")

    if not verificar_pausa():
        return False

    try:
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            if "sistemaflow" in driver.current_url:
                break

        time.sleep(2)

        if not verificar_pausa():
            return False

        try:
            menu_whatsapp = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'WhatsApp')] | //button[contains(text(), 'WhatsApp')] | //*[contains(@class, 'whatsapp')]"))
            )
            menu_whatsapp.click()
            time.sleep(2)
        except:
            print("  Menu WhatsApp não encontrado, tentando localizar botão adicionar...")

        if not verificar_pausa():
            return False

        try:
            botao_adicionar = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Adicionar')] | //button[contains(text(), 'Novo')] | //*[contains(@class, 'add')]"))
            )
            botao_adicionar.click()
            time.sleep(2)
        except Exception as e:
            print(f"  Erro ao clicar em adicionar: {e}")
            return False

        if not verificar_pausa():
            return False

        try:
            campo_nome = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//input[@placeholder='Nome'] | //input[@name='nome'] | //input[contains(@id, 'nome')]"))
            )
            campo_nome.clear()
            campo_nome.send_keys(nome)
            time.sleep(1)
        except Exception as e:
            print(f"  Erro ao preencher nome: {e}")

        try:
            campo_telefone = driver.find_element(By.XPATH, "//input[@placeholder='Telefone'] | //input[@name='telefone'] | //input[contains(@id, 'telefone')] | //input[@type='tel']")
            campo_telefone.clear()
            campo_telefone.send_keys(telefone)
            time.sleep(1)
        except Exception as e:
            print(f"  Erro ao preencher telefone: {e}")

        try:
            campo_processo = driver.find_element(By.XPATH, "//input[@placeholder='Processo'] | //input[@name='processo'] | //input[contains(@id, 'processo')]")
            campo_processo.clear()
            campo_processo.send_keys(processo)
            time.sleep(1)
        except Exception as e:
            print(f"  Erro ao preencher processo: {e}")

        try:
            campo_observacoes = driver.find_element(By.XPATH, "//textarea | //input[@placeholder='Observações'] | //input[contains(@id, 'obs')]")
            campo_observacoes.clear()
            campo_observacoes.send_keys(texto_edital[:500])
            time.sleep(1)
        except Exception as e:
            print(f"  Campo observações não encontrado: {e}")

        try:
            input_file = driver.find_element(By.XPATH, "//input[@type='file']")
            input_file.send_keys(os.path.abspath(screenshot_path))
            time.sleep(2)
        except Exception as e:
            print(f"  Erro ao fazer upload do screenshot: {e}")

        try:
            botao_salvar = driver.find_element(By.XPATH, "//button[contains(text(), 'Salvar')] | //button[contains(text(), 'Confirmar')] | //button[@type='submit']")
            botao_salvar.click()
            time.sleep(3)
            print(f"  ✓ Contato adicionado com sucesso!")
            return True
        except Exception as e:
            print(f"  Erro ao salvar: {e}")
            return False

    except Exception as e:
        print(f"  Erro ao adicionar no Flow: {e}")
        return False

def processar_edital_completo_com_flow(driver, caminho_pdf):
    print("\n" + "="*60)
    print("PROCESSAMENTO COMPLETO: PDF → MIND7 → VALIDAÇÃO → FLOW")
    print("="*60)

    texto_edital_completo = extrair_texto_completo_pdf(caminho_pdf)

    dados_edital = extrair_dados_pdf(caminho_pdf)

    if not dados_edital:
        print("Nenhum dado extraído do PDF!")
        return

    login_flow(driver)

    contatos_adicionados = 0
    max_contatos = 2

    # Inicia thread de controle de pausa
    thread_controle = threading.Thread(target=controlar_pausa, daemon=True)
    thread_controle.start()

    for i, pessoa in enumerate(dados_edital, 1):
        if not continuar_processamento:
            print("\n⏹️  Processamento interrompido pelo usuário!")
            break

        if contatos_adicionados >= max_contatos:
            print(f"\n✓ Limite de {max_contatos} contatos atingido!")
            break

        print(f"\n[{i}/{len(dados_edital)}] Processando: {pessoa['nome']}")

        if not verificar_pausa():
            print("\n⏹️  Processamento interrompido!")
            break

        # Muda para aba do Mind7
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            if "mind-7" in driver.current_url or handle == driver.window_handles[0]:
                break

        dados_mind7 = consultar_mind7_completo(driver, pessoa['nome'])

        if not continuar_processamento:
            break

        if dados_mind7 and dados_mind7['telefones_whatsapp']:
            print(f"  Telefones WhatsApp encontrados: {len(dados_mind7['telefones_whatsapp'])}")

            for telefone in dados_mind7['telefones_whatsapp']:
                if not continuar_processamento:
                    break

                if contatos_adicionados >= max_contatos:
                    break

                if not verificar_pausa():
                    break

                print(f"  Validando WhatsApp: {telefone}")
                if validar_whatsapp(telefone):
                    sucesso = adicionar_contato_flow(
                        driver,
                        pessoa['nome'],
                        telefone,
                        pessoa['processo'],
                        dados_mind7['screenshot'],
                        texto_edital_completo
                    )

                    if sucesso:
                        contatos_adicionados += 1
                        print(f"  ✓ Contato {contatos_adicionados}/{max_contatos} adicionado!")

                    time.sleep(3)
        else:
            print(f"  ✗ Nenhum WhatsApp válido encontrado")

        time.sleep(2)

    print("\n" + "="*60)
    print(f"PROCESSAMENTO CONCLUÍDO!")
    print(f"Total de contatos adicionados no Flow: {contatos_adicionados}")
    print("="*60)

def main():
    print("="*60)
    print("AUTOMAÇÃO COMPLETA - EDITAL → MIND7 → FLOW")
    print("="*60)

    print("\nEscolha o modo de conexão:")
    print("1 - Conectar ao navegador existente (recomendado - usa suas abas logadas)")
    print("2 - Abrir novo navegador")

    modo = input("\nModo: ")

    if modo == "1":
        driver = configurar_navegador_existente()
        if not driver:
            print("\n❌ Não foi possível conectar. Encerrando...")
            return
    else:
        driver = configurar_navegador()

    try:
        if modo == "2":
            print("\nAbrindo Mind-7 e aguardando Cloudflare...")
            driver.get("https://mind-7.org/painel/consultas/nome_v2/")
            print("Aguarde 30 segundos para resolver o Cloudflare...")
            time.sleep(30)

        print("\nEscolha a opção:")
        print("1 - Processamento COMPLETO (PDF → Mind7 → Validação WhatsApp → Flow)")
        print("2 - Apenas extrair dados do PDF")
        print("3 - Consulta manual de um nome no Mind7")

        opcao = input("\nOpção: ")

        if opcao == "1":
            print("\nComo deseja informar o PDF?")
            print("1 - Digitar caminho completo")
            print("2 - Listar PDFs da pasta Downloads")

            opcao_pdf = input("\nOpção: ")

            if opcao_pdf == "2":
                import glob
                downloads = os.path.join(os.path.expanduser("~"), "Downloads")
                pdfs = glob.glob(os.path.join(downloads, "*.pdf"))

                if pdfs:
                    print("\nPDFs encontrados:")
                    for i, pdf in enumerate(pdfs[:20], 1):  # Mostra até 20
                        print(f"{i} - {os.path.basename(pdf)}")

                    escolha = int(input("\nNúmero do PDF: ")) - 1
                    caminho_pdf = pdfs[escolha]
                else:
                    print("Nenhum PDF encontrado!")
                    return
            else:
                caminho_pdf = input("\nCaminho completo do PDF do edital: ").strip('"').strip("'")

            print(f"\nUsando PDF: {caminho_pdf}")
            processar_edital_completo_com_flow(driver, caminho_pdf)

        elif opcao == "2":
            caminho_pdf = input("\nCaminho completo do PDF: ").strip('"').strip("'")
            dados = extrair_dados_pdf(caminho_pdf)
            texto_completo = extrair_texto_completo_pdf(caminho_pdf)

            if dados:
                df = pd.DataFrame(dados)
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                arquivo_csv = f"edital_extraido_{timestamp}.csv"
                arquivo_txt = f"edital_texto_completo_{timestamp}.txt"

                df.to_csv(arquivo_csv, index=False, encoding='utf-8-sig')

                with open(arquivo_txt, 'w', encoding='utf-8') as f:
                    f.write(texto_completo)

                print(f"\nArquivos salvos:")
                print(f"  - {arquivo_csv}")
                print(f"  - {arquivo_txt}")

        elif opcao == "3":
            nome = input("\nNome para consultar: ")
            resultado = consultar_mind7_completo(driver, nome)
            if resultado:
                print(f"\nCPF: {resultado['cpf']}")
                print(f"WhatsApp: {', '.join(resultado['telefones_whatsapp'])}")
                print(f"Screenshot: {resultado['screenshot']}")

        input("\nPressione Enter para fechar...")

    except Exception as e:
        print(f"\nErro: {e}")
        import traceback
        traceback.print_exc()
        input("\nPressione Enter para fechar...")
    finally:
        if modo == "2":
            driver.quit()
        else:
            print("\n✓ Navegador mantido aberto (modo conexão existente)")

    try:
        if modo == "2":
            print("\nAbrindo Mind-7 e aguardando Cloudflare...")
            driver.get("https://mind-7.org/painel/consultas/nome_v2/")
            print("Aguarde 30 segundos para resolver o Cloudflare...")
            time.sleep(30)

        print("\nEscolha a opção:")
        print("1 - Processamento COMPLETO (PDF → Mind7 → Validação WhatsApp → Flow)")
        print("2 - Apenas extrair dados do PDF")
        print("3 - Consulta manual de um nome no Mind7")

        opcao = input("\nOpção: ")

        if opcao == "1":
            caminho_pdf = input("\nCaminho completo do PDF do edital: ")
            processar_edital_completo_com_flow(driver, caminho_pdf)

        elif opcao == "2":
            caminho_pdf = input("\nCaminho completo do PDF: ")
            dados = extrair_dados_pdf(caminho_pdf)
            texto_completo = extrair_texto_completo_pdf(caminho_pdf)

            if dados:
                df = pd.DataFrame(dados)
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                arquivo_csv = f"edital_extraido_{timestamp}.csv"
                arquivo_txt = f"edital_texto_completo_{timestamp}.txt"

                df.to_csv(arquivo_csv, index=False, encoding='utf-8-sig')

                with open(arquivo_txt, 'w', encoding='utf-8') as f:
                    f.write(texto_completo)

                print(f"\nArquivos salvos:")
                print(f"  - {arquivo_csv}")
                print(f"  - {arquivo_txt}")

        elif opcao == "3":
            nome = input("\nNome para consultar: ")
            resultado = consultar_mind7_completo(driver, nome)
            if resultado:
                print(f"\nCPF: {resultado['cpf']}")
                print(f"WhatsApp: {', '.join(resultado['telefones_whatsapp'])}")
                print(f"Screenshot: {resultado['screenshot']}")

        input("\nPressione Enter para fechar...")

    except Exception as e:
        print(f"\nErro: {e}")
        import traceback
        traceback.print_exc()
        input("\nPressione Enter para fechar...")
    finally:
        if modo == "2":
            driver.quit()
        else:
            print("\n✓ Navegador mantido aberto (modo conexão existente)")

if __name__ == "__main__":
    main()
