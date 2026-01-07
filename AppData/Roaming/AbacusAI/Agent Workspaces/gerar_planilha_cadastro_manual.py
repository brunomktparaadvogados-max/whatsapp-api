# -*- coding: utf-8 -*-
import time
import re
import json
import csv
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import PyPDF2

def extrair_dados_edital_pdf(caminho_pdf):
    print(f"\n=== EXTRAINDO DADOS DO EDITAL PDF ===")
    print(f"Arquivo: {caminho_pdf}")
    
    dados = []
    
    try:
        with open(caminho_pdf, 'rb') as arquivo:
            leitor = PyPDF2.PdfReader(arquivo)
            texto_completo = ""
            
            for pagina in leitor.pages:
                texto_completo += pagina.extract_text()
            
            linhas = texto_completo.split('\n')
            
            for i, linha in enumerate(linhas):
                if re.search(r'\d{11}', linha):
                    nome_match = re.search(r'([A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜ\s]+)', linha)
                    renach_match = re.search(r'(\d{11})', linha)
                    processo_match = re.search(r'(\d{7,}[-/]?\d*)', linha)
                    
                    if nome_match and renach_match:
                        nome = nome_match.group(1).strip()
                        renach = renach_match.group(1)
                        processo = processo_match.group(1) if processo_match else "N/A"
                        
                        if len(nome) > 5:
                            dados.append({
                                'nome': nome,
                                'renach': renach,
                                'processo': processo
                            })
                            print(f"  [+] {nome} | RENACH: {renach} | Processo: {processo}")
    
    except Exception as e:
        print(f"[X] ERRO ao ler PDF: {e}")
    
    print(f"\nTotal de pessoas encontradas: {len(dados)}")
    return dados

def extrair_nome_da_aba(driver):
    try:
        titulo = driver.title
        
        if "Mind-7" in titulo or "Consulta" in titulo:
            try:
                elemento_nome = driver.find_element(By.XPATH, "//td[contains(text(), 'Nome')]/following-sibling::td")
                return elemento_nome.text.strip()
            except:
                pass
            
            try:
                elemento_nome = driver.find_element(By.XPATH, "//strong[contains(text(), 'Nome')]/parent::*/following-sibling::*")
                return elemento_nome.text.strip()
            except:
                pass
        
        return None
    except:
        return None

def processar_abas_abertas(driver, dados_edital):
    print(f"\n=== PROCESSANDO ABAS ABERTAS DO NAVEGADOR ===")
    
    handles = driver.window_handles
    print(f"Total de abas abertas: {len(handles)}")
    
    resultados = []
    
    for idx, handle in enumerate(handles, 1):
        try:
            driver.switch_to.window(handle)
            time.sleep(1)
            
            url = driver.current_url
            titulo = driver.title
            
            print(f"\n[Aba {idx}] {titulo[:50]}...")
            
            if "mind-7" in url.lower() or "consulta" in url.lower():
                nome_aba = extrair_nome_da_aba(driver)
                
                if nome_aba:
                    print(f"  Nome encontrado na aba: {nome_aba}")
                    
                    for pessoa in dados_edital:
                        if pessoa['nome'].upper() in nome_aba.upper() or nome_aba.upper() in pessoa['nome'].upper():
                            print(f"  [MATCH] Corresponde a: {pessoa['nome']}")
                            
                            resultados.append({
                                'nome': pessoa['nome'],
                                'processo': pessoa['processo'],
                                'renach': pessoa['renach'],
                                'aba_numero': idx,
                                'aba_titulo': titulo,
                                'pdf_sugerido': f"PDF_{pessoa['nome'].replace(' ', '_')}_{pessoa['processo'].replace('/', '-')}.pdf"
                            })
                            break
                else:
                    print(f"  Nao foi possivel extrair nome desta aba")
            else:
                print(f"  [SKIP] Nao e uma aba do Mind-7")
        
        except Exception as e:
            print(f"  [X] Erro ao processar aba {idx}: {e}")
    
    return resultados

def gerar_arquivo_csv(resultados, nome_arquivo="cadastro_manual_flow.csv"):
    print(f"\n=== GERANDO ARQUIVO CSV ===")
    
    with open(nome_arquivo, 'w', newline='', encoding='utf-8-sig') as arquivo:
        campos = ['nome', 'processo', 'renach', 'aba_numero', 'aba_titulo', 'pdf_sugerido']
        escritor = csv.DictWriter(arquivo, fieldnames=campos)
        
        escritor.writeheader()
        escritor.writerows(resultados)
    
    print(f"[OK] Arquivo gerado: {nome_arquivo}")
    print(f"Total de registros: {len(resultados)}")

def gerar_arquivo_json(resultados, nome_arquivo="cadastro_manual_flow.json"):
    with open(nome_arquivo, 'w', encoding='utf-8') as arquivo:
        json.dump(resultados, arquivo, indent=2, ensure_ascii=False)
    
    print(f"[OK] Arquivo JSON gerado: {nome_arquivo}")

def main():
    print("=" * 60)
    print("GERADOR DE PLANILHA PARA CADASTRO MANUAL NO FLOW")
    print("=" * 60)
    
    caminho_pdf = input("\nCaminho do PDF do edital: ").strip().strip('"')
    
    dados_edital = extrair_dados_edital_pdf(caminho_pdf)
    
    if not dados_edital:
        print("\n[X] Nenhum dado extraido do PDF. Verifique o arquivo.")
        return
    
    print("\n[!] Conectando ao Chrome em modo debug...")
    print("[!] Certifique-se de que o Chrome esta rodando com:")
    print("    chrome.exe --remote-debugging-port=9222")
    
    input("\nPressione ENTER quando o Chrome estiver pronto...")
    
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        print("[OK] Conectado ao Chrome!")
        
        resultados = processar_abas_abertas(driver, dados_edital)
        
        if resultados:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            nome_csv = f"cadastro_manual_flow_{timestamp}.csv"
            nome_json = f"cadastro_manual_flow_{timestamp}.json"
            
            gerar_arquivo_csv(resultados, nome_csv)
            gerar_arquivo_json(resultados, nome_json)
            
            print("\n" + "=" * 60)
            print("RESUMO DOS RESULTADOS")
            print("=" * 60)
            
            for r in resultados:
                print(f"\nNome: {r['nome']}")
                print(f"  Processo: {r['processo']}")
                print(f"  RENACH/CNH: {r['renach']}")
                print(f"  Aba do navegador: #{r['aba_numero']}")
                print(f"  PDF sugerido: {r['pdf_sugerido']}")
            
            print("\n" + "=" * 60)
            print(f"[OK] Arquivos gerados com sucesso!")
            print(f"     CSV: {nome_csv}")
            print(f"     JSON: {nome_json}")
            print("=" * 60)
        else:
            print("\n[!] Nenhuma correspondencia encontrada entre o PDF e as abas abertas")
            print("    Verifique se as abas do Mind-7 estao abertas com os dados corretos")
    
    except Exception as e:
        print(f"\n[X] ERRO: {e}")
        print("\nVerifique se:")
        print("  1. O Chrome esta rodando em modo debug (porta 9222)")
        print("  2. As abas do Mind-7 estao abertas")
        print("  3. Voce esta logado no Mind-7")

if __name__ == "__main__":
    main()
