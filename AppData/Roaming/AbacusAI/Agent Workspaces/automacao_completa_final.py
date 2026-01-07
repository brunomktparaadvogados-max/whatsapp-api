# -*- coding: utf-8 -*-
import time
import re
import json
import urllib.parse
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import PyPDF2

def extrair_dados_edital_pdf(caminho_pdf):
    caminho_pdf = urllib.parse.unquote(urllib.parse.unquote(caminho_pdf))
    
    print(f"\n{'='*80}")
    print(f"EXTRAINDO DADOS DO EDITAL")
    print(f"{'='*80}")
    print(f"Arquivo: {caminho_pdf}")
    
    data_edital = None
    tipo_edital = None
    
    match_url = re.search(r'/([^/]+)-data-(\d{4}-\d{2}-\d{2})\.pdf', caminho_pdf)
    if match_url:
        tipo_edital = match_url.group(1).replace('-', ' ').title()
        data_edital = match_url.group(2)
        print(f"Data do edital: {data_edital}")
        print(f"Tipo do edital: {tipo_edital}")
    
    dados = []
    
    try:
        with open(caminho_pdf, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            texto_completo = ""
            
            for page in pdf_reader.pages:
                texto_completo += page.extract_text()
            
            linhas = texto_completo.split('\n')
            
            for linha in linhas:
                match = re.search(r'(\d{2}/\d{2}/\d{4})\s+([A-Z][A-Z\s]+?)\s+(\d+)\s+(\d+)\s+(.+)', linha)
                
                if match:
                    data_pub = match.group(1)
                    nome = match.group(2).strip()
                    renach = match.group(3)
                    processo = match.group(4)
                    penalidade = match.group(5).strip()
                    
                    nome = ' '.join(nome.split())
                    
                    dados.append({
                        'data_publicacao': data_pub,
                        'nome': nome,
                        'renach': renach,
                        'processo': processo,
                        'penalidade': penalidade,
                        'data_edital': data_edital,
                        'tipo_edital': tipo_edital
                    })
                    
                    print(f"  ✓ {nome} | RENACH: {renach} | Processo: {processo}")
            
            print(f"\n{'='*80}")
            print(f"Total de registros extraídos: {len(dados)}")
            print(f"{'='*80}\n")
            
            return dados
    
    except Exception as e:
        print(f"❌ Erro ao extrair PDF: {e}")
        return []

def detectar_tipo_resultado(driver):
    try:
        time.sleep(2)
        
        tabela = driver.find_element(By.CSS_SELECTOR, "table.table")
        linhas = tabela.find_elements(By.TAG_NAME, "tr")
        
        linhas_dados = [l for l in linhas if l.find_elements(By.TAG_NAME, "td")]
        
        if len(linhas_dados) == 0:
            return "sem_resultado", 0, None
        elif len(linhas_dados) == 1:
            return "unico", 1, linhas_dados[0]
        else:
            return "multiplo", len(linhas_dados), linhas_dados
    
    except Exception as e:
        print(f"  ⚠️ Erro ao detectar tipo de resultado: {e}")
        return "erro", 0, None

def extrair_cpf_da_linha(linha):
    try:
        colunas = linha.find_elements(By.TAG_NAME, "td")
        
        for coluna in colunas:
            texto = coluna.text.strip()
            
            if re.match(r'\d{3}\.\d{3}\.\d{3}-\d{2}', texto):
                return texto, coluna
        
        links = linha.find_elements(By.TAG_NAME, "a")
        for link in links:
            href = link.get_attribute("href")
            if href and "cpf=" in href:
                return link.text.strip(), link
        
        return None, None
    
    except Exception as e:
        print(f"  ⚠️ Erro ao extrair CPF: {e}")
        return None, None

def clicar_cpf_e_abrir_subpagina(driver, linha):
    try:
        cpf_texto, elemento_cpf = extrair_cpf_da_linha(linha)
        
        if not cpf_texto:
            print(f"  ❌ CPF não encontrado na linha")
            return False, None
        
        print(f"  📋 CPF encontrado: {cpf_texto}")
        
        if elemento_cpf.tag_name == "a":
            print(f"  🖱️ Clicando no link do CPF...")
            elemento_cpf.click()
        else:
            link = linha.find_element(By.TAG_NAME, "a")
            print(f"  🖱️ Clicando no link da linha...")
            link.click()
        
        time.sleep(3)
        
        abas = driver.window_handles
        if len(abas) > 1:
            driver.switch_to.window(abas[-1])
            print(f"  ✅ Subpágina aberta com sucesso!")
            return True, cpf_texto
        else:
            print(f"  ⚠️ Subpágina não abriu em nova aba")
            return False, cpf_texto
    
    except Exception as e:
        print(f"  ❌ Erro ao clicar no CPF: {e}")
        return False, None

def extrair_dados_subpagina(driver):
    try:
        time.sleep(2)
        
        dados = {
            'cpf': None,
            'telefone': None,
            'celular': None,
            'email': None,
            'endereco': None,
            'cidade': None,
            'estado': None,
            'cep': None
        }
        
        texto_pagina = driver.page_source
        
        match_cpf = re.search(r'CPF[:\s]*(\d{3}\.\d{3}\.\d{3}-\d{2})', texto_pagina)
        if match_cpf:
            dados['cpf'] = match_cpf.group(1)
        
        match_tel = re.search(r'Telefone[:\s]*\(?(\d{2})\)?\s*(\d{4,5})-?(\d{4})', texto_pagina)
        if match_tel:
            dados['telefone'] = f"({match_tel.group(1)}) {match_tel.group(2)}-{match_tel.group(3)}"
        
        match_cel = re.search(r'Celular[:\s]*\(?(\d{2})\)?\s*(\d{5})-?(\d{4})', texto_pagina)
        if match_cel:
            dados['celular'] = f"({match_cel.group(1)}) {match_cel.group(2)}-{match_cel.group(3)}"
        
        match_email = re.search(r'E-?mail[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', texto_pagina)
        if match_email:
            dados['email'] = match_email.group(1)
        
        return dados
    
    except Exception as e:
        print(f"  ⚠️ Erro ao extrair dados da subpágina: {e}")
        return None

def gerar_pdf_subpagina(driver, nome, processo):
    try:
        nome_arquivo = f"{nome.replace(' ', '_')}_PROCESSO_{processo}.pdf"
        
        print(f"  📄 Gerando PDF: {nome_arquivo}")
        
        driver.execute_script("window.print();")
        
        time.sleep(2)
        
        print(f"  ✅ PDF gerado (use Ctrl+P manualmente para salvar)")
        
        return nome_arquivo
    
    except Exception as e:
        print(f"  ❌ Erro ao gerar PDF: {e}")
        return None

def validar_whatsapp(telefone):
    if not telefone:
        return False
    
    numeros = re.sub(r'\D', '', telefone)
    
    if len(numeros) == 11 and numeros[2] == '9':
        return True
    
    return False

def processar_pessoa(driver, pessoa, aba_mind7):
    print(f"\n{'='*80}")
    print(f"PROCESSANDO: {pessoa['nome']}")
    print(f"{'='*80}")
    print(f"RENACH: {pessoa['renach']}")
    print(f"Processo: {pessoa['processo']}")
    print(f"Penalidade: {pessoa['penalidade']}")
    print(f"Data Publicação: {pessoa['data_publicacao']}")
    
    resultado = {
        'nome': pessoa['nome'],
        'renach': pessoa['renach'],
        'processo': pessoa['processo'],
        'penalidade': pessoa['penalidade'],
        'status': 'pendente',
        'tipo_resultado': None,
        'cpf': None,
        'telefone': None,
        'whatsapp_valido': False,
        'pdf_gerado': None,
        'dados_completos': None
    }
    
    try:
        url_consulta = "https://mind-7.org/painel/consultas/nome_v2/"
        driver.execute_script(f"window.open('{url_consulta}', '_blank');")
        time.sleep(2)
        
        nova_aba = driver.window_handles[-1]
        driver.switch_to.window(nova_aba)
        
        campo_nome = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "nome"))
        )
        
        campo_nome.clear()
        campo_nome.send_keys(pessoa['nome'])
        
        botao = driver.find_element(By.XPATH, "//button[@type='submit']")
        botao.click()
        
        time.sleep(3)
        
        tipo, quantidade, dados_resultado = detectar_tipo_resultado(driver)
        resultado['tipo_resultado'] = tipo
        
        print(f"\n  📊 Resultado: {tipo.upper()} ({quantidade} registro(s))")
        
        if tipo == "sem_resultado":
            print(f"  ⚠️ Nenhum resultado encontrado")
            resultado['status'] = 'sem_resultado'
        
        elif tipo == "multiplo":
            print(f"  ⚠️ Múltiplos resultados encontrados - necessário análise manual")
            resultado['status'] = 'multiplo_resultados'
        
        elif tipo == "unico":
            print(f"  ✅ Resultado único encontrado!")
            
            sucesso, cpf = clicar_cpf_e_abrir_subpagina(driver, dados_resultado)
            
            if sucesso:
                resultado['cpf'] = cpf
                
                dados_subpagina = extrair_dados_subpagina(driver)
                resultado['dados_completos'] = dados_subpagina
                
                if dados_subpagina:
                    telefone = dados_subpagina.get('celular') or dados_subpagina.get('telefone')
                    resultado['telefone'] = telefone
                    
                    if telefone:
                        whatsapp_ok = validar_whatsapp(telefone)
                        resultado['whatsapp_valido'] = whatsapp_ok
                        
                        if whatsapp_ok:
                            print(f"  ✅ WhatsApp válido: {telefone}")
                        else:
                            print(f"  ⚠️ Telefone não é WhatsApp: {telefone}")
                
                pdf_nome = gerar_pdf_subpagina(driver, pessoa['nome'], pessoa['processo'])
                resultado['pdf_gerado'] = pdf_nome
                
                resultado['status'] = 'processado_sucesso'
            else:
                resultado['status'] = 'erro_abrir_subpagina'
        
        time.sleep(1)
        
    except Exception as e:
        print(f"  ❌ Erro ao processar: {e}")
        resultado['status'] = 'erro'
    
    return resultado

def main():
    print("\n" + "="*80)
    print("AUTOMACAO COMPLETA - EDITAL > MIND-7 > FLOW")
    print("="*80)
    
    caminho_pdf = input("\nCaminho do PDF do edital: ").strip().strip('"')
    
    dados_edital = extrair_dados_edital_pdf(caminho_pdf)
    
    if not dados_edital:
        print("\n❌ Nenhum dado extraído do PDF!")
        return
    
    print(f"\n✅ {len(dados_edital)} pessoas encontradas no edital")
    
    input("\n⚠️ Certifique-se de que o Chrome está aberto em modo debug e você está logado no Mind-7.\nPressione ENTER para continuar...")
    
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        print("✅ Conectado ao navegador!")
    except Exception as e:
        print(f"❌ Erro ao conectar: {e}")
        return
    
    aba_mind7 = None
    for handle in driver.window_handles:
        driver.switch_to.window(handle)
        if "mind-7.org" in driver.current_url:
            aba_mind7 = handle
            break
    
    if not aba_mind7:
        print("\n❌ Aba do Mind-7 não encontrada!")
        return
    
    resultados = []
    
    for i, pessoa in enumerate(dados_edital, 1):
        print(f"\n\n{'#'*80}")
        print(f"PESSOA {i}/{len(dados_edital)}")
        print(f"{'#'*80}")
        
        resultado = processar_pessoa(driver, pessoa, aba_mind7)
        resultados.append(resultado)
        
        time.sleep(1)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    arquivo_resultado = f"resultado_processamento_{timestamp}.json"
    
    with open(arquivo_resultado, 'w', encoding='utf-8') as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)
    
    print(f"\n\n{'='*80}")
    print("RELATÓRIO FINAL")
    print(f"{'='*80}")
    
    total = len(resultados)
    sucesso = len([r for r in resultados if r['status'] == 'processado_sucesso'])
    sem_resultado = len([r for r in resultados if r['status'] == 'sem_resultado'])
    multiplos = len([r for r in resultados if r['status'] == 'multiplo_resultados'])
    whatsapp_validos = len([r for r in resultados if r['whatsapp_valido']])
    
    print(f"\nTotal processado: {total}")
    print(f"✅ Sucesso (resultado único): {sucesso}")
    print(f"⚠️ Sem resultado: {sem_resultado}")
    print(f"⚠️ Múltiplos resultados: {multiplos}")
    print(f"📱 WhatsApp válidos: {whatsapp_validos}")
    
    print(f"\n📄 Relatório salvo em: {arquivo_resultado}")
    print(f"{'='*80}\n")
    
    input("Pressione ENTER para sair...")

if __name__ == "__main__":
    main()
