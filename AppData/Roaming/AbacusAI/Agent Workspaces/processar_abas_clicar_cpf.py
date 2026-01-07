# -*- coding: utf-8 -*-
import time
import re
import json
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

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
        print(f"  Erro ao detectar tipo de resultado: {e}")
        return "erro", 0, None

def extrair_nome_da_pagina(driver):
    try:
        campo_nome = driver.find_element(By.ID, "nome")
        return campo_nome.get_attribute("value")
    except:
        try:
            titulo = driver.find_element(By.TAG_NAME, "h1")
            return titulo.text
        except:
            return "DESCONHECIDO"

def extrair_cpf_da_linha(linha):
    try:
        colunas = linha.find_elements(By.TAG_NAME, "td")
        
        for coluna in colunas:
            links = coluna.find_elements(By.TAG_NAME, "a")
            for link in links:
                texto = link.text.strip()
                if re.match(r'\d{3}\.\d{3}\.\d{3}-\d{2}', texto):
                    print(f"    CPF encontrado (link): {texto}")
                    return texto, link
        
        for coluna in colunas:
            texto = coluna.text.strip()
            if re.match(r'\d{3}\.\d{3}\.\d{3}-\d{2}', texto):
                print(f"    CPF encontrado (texto): {texto}")
                links = linha.find_elements(By.TAG_NAME, "a")
                if links:
                    return texto, links[0]
                return texto, coluna
        
        return None, None
    
    except Exception as e:
        print(f"    Erro ao extrair CPF: {e}")
        return None, None

def clicar_cpf_e_abrir_subpagina(driver, linha, nome_pessoa):
    try:
        cpf_texto, elemento_cpf = extrair_cpf_da_linha(linha)
        
        if not cpf_texto:
            print(f"    [X] CPF nao encontrado na linha")
            return False, None
        
        print(f"    [OK] CPF: {cpf_texto}")
        
        abas_antes = len(driver.window_handles)
        
        if elemento_cpf.tag_name == "a":
            print(f"    Clicando no link do CPF...")
            elemento_cpf.click()
        else:
            links = linha.find_elements(By.TAG_NAME, "a")
            if links:
                print(f"    Clicando no primeiro link da linha...")
                links[0].click()
            else:
                print(f"    [X] Nenhum link encontrado")
                return False, cpf_texto
        
        time.sleep(3)
        
        abas_depois = len(driver.window_handles)
        
        if abas_depois > abas_antes:
            driver.switch_to.window(driver.window_handles[-1])
            print(f"    [OK] Subpagina aberta!")
            return True, cpf_texto
        else:
            print(f"    [!] Subpagina nao abriu em nova aba")
            return False, cpf_texto
    
    except Exception as e:
        print(f"    [X] Erro ao clicar no CPF: {e}")
        return False, None

def processar_aba(driver, handle, indice, total):
    print(f"\n{'='*80}")
    print(f"ABA {indice}/{total}")
    print(f"{'='*80}")
    
    resultado = {
        'indice': indice,
        'url': None,
        'nome': None,
        'tipo_resultado': None,
        'quantidade': 0,
        'cpf': None,
        'subpagina_aberta': False,
        'status': 'pendente'
    }
    
    try:
        driver.switch_to.window(handle)
        time.sleep(1)
        
        url = driver.current_url
        resultado['url'] = url
        
        print(f"URL: {url}")
        
        if "mind-7.org" not in url:
            print(f"[PULAR] Nao e uma aba do Mind-7")
            resultado['status'] = 'pulado_nao_mind7'
            return resultado
        
        if "consultas/nome_v2" not in url:
            print(f"[PULAR] Nao e uma pagina de consulta")
            resultado['status'] = 'pulado_nao_consulta'
            return resultado
        
        nome = extrair_nome_da_pagina(driver)
        resultado['nome'] = nome
        print(f"Nome pesquisado: {nome}")
        
        tipo, quantidade, dados = detectar_tipo_resultado(driver)
        resultado['tipo_resultado'] = tipo
        resultado['quantidade'] = quantidade
        
        print(f"Resultado: {tipo.upper()} ({quantidade} registro(s))")
        
        if tipo == "sem_resultado":
            print(f"[!] Nenhum resultado encontrado")
            resultado['status'] = 'sem_resultado'
        
        elif tipo == "multiplo":
            print(f"[!] Multiplos resultados - necessario analise manual")
            resultado['status'] = 'multiplo_resultados'
        
        elif tipo == "unico":
            print(f"[OK] Resultado unico encontrado!")
            print(f"Tentando clicar no CPF...")
            
            sucesso, cpf = clicar_cpf_e_abrir_subpagina(driver, dados, nome)
            
            resultado['cpf'] = cpf
            resultado['subpagina_aberta'] = sucesso
            
            if sucesso:
                resultado['status'] = 'processado_sucesso'
                print(f"[OK] Subpagina aberta com sucesso!")
            else:
                resultado['status'] = 'erro_abrir_subpagina'
                print(f"[X] Falha ao abrir subpagina")
        
        else:
            resultado['status'] = 'erro_detectar'
        
        time.sleep(1)
        
    except Exception as e:
        print(f"[X] Erro ao processar aba: {e}")
        resultado['status'] = 'erro'
    
    return resultado

def main():
    print("\n" + "="*80)
    print("PROCESSAR ABAS ABERTAS - CLICAR NO CPF")
    print("="*80)
    print("\nEste script vai:")
    print("1. Verificar todas as abas abertas")
    print("2. Identificar abas do Mind-7 com resultados de pesquisa")
    print("3. Detectar se o resultado e unico")
    print("4. Clicar no CPF para abrir a subpagina")
    print("="*80)
    
    input("\nPressione ENTER para continuar...")
    
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        print("\n[OK] Conectado ao navegador!")
    except Exception as e:
        print(f"\n[X] Erro ao conectar: {e}")
        print("\nCertifique-se de que o Chrome esta aberto em modo debug.")
        input("\nPressione ENTER para sair...")
        return
    
    todas_abas = driver.window_handles
    total_abas = len(todas_abas)
    
    print(f"\n[OK] Total de abas abertas: {total_abas}")
    
    resultados = []
    
    for i, handle in enumerate(todas_abas, 1):
        resultado = processar_aba(driver, handle, i, total_abas)
        resultados.append(resultado)
        time.sleep(0.5)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    arquivo_resultado = f"resultado_processamento_abas_{timestamp}.json"
    
    with open(arquivo_resultado, 'w', encoding='utf-8') as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)
    
    print(f"\n\n{'='*80}")
    print("RELATORIO FINAL")
    print(f"{'='*80}")
    
    total = len(resultados)
    processados = len([r for r in resultados if r['status'] == 'processado_sucesso'])
    sem_resultado = len([r for r in resultados if r['status'] == 'sem_resultado'])
    multiplos = len([r for r in resultados if r['status'] == 'multiplo_resultados'])
    erros = len([r for r in resultados if 'erro' in r['status']])
    pulados = len([r for r in resultados if 'pulado' in r['status']])
    
    print(f"\nTotal de abas: {total}")
    print(f"[OK] Processados com sucesso: {processados}")
    print(f"[!] Sem resultado: {sem_resultado}")
    print(f"[!] Multiplos resultados: {multiplos}")
    print(f"[X] Erros: {erros}")
    print(f"[-] Pulados: {pulados}")
    
    print(f"\nRelatorio salvo em: {arquivo_resultado}")
    print(f"{'='*80}\n")
    
    print("\nAgora voce tem:")
    print(f"- {processados} subpaginas abertas com dados completos")
    print(f"- {multiplos} abas com multiplos resultados (analise manual)")
    print(f"- {sem_resultado} abas sem resultado")
    
    input("\nPressione ENTER para sair...")

if __name__ == "__main__":
    main()
