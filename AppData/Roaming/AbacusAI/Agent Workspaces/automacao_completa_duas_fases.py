# -*- coding: utf-8 -*-
import time
import re
import json
import sys
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import PyPDF2

MAX_ERROS_CONSECUTIVOS = 3
PAUSAR_A_CADA = 10

def limpar_tela():
    import os
    os.system('cls' if os.name == 'nt' else 'clear')

def pausar_processo():
    print(f"\n{'='*80}")
    print("PROCESSO PAUSADO")
    print(f"{'='*80}")
    print("\nOpcoes:")
    print("[1] Continuar processamento")
    print("[2] Revisar navegador e continuar")
    print("[3] Cancelar e sair")
    print(f"{'='*80}")
    
    escolha = input("\nEscolha uma opcao (1/2/3): ").strip()
    
    if escolha == "1":
        print("\n[OK] Continuando processamento...")
        return True
    elif escolha == "2":
        print("\n[!] Revise o navegador agora.")
        print("[!] Verifique se:")
        print("    - O Chrome esta aberto")
        print("    - Voce esta logado no Mind-7")
        print("    - As abas estao carregando corretamente")
        input("\nPressione ENTER quando estiver pronto para continuar...")
        return True
    else:
        print("\n[X] Processo cancelado pelo usuario.")
        return False

def verificar_saude_navegador(driver):
    try:
        driver.current_url
        driver.window_handles
        return True
    except Exception as e:
        return False

def perguntar_continuar_apos_erros(erros_consecutivos):
    print(f"\n{'='*80}")
    print(f"ALERTA: {erros_consecutivos} ERROS CONSECUTIVOS DETECTADOS")
    print(f"{'='*80}")
    print("\nPossíveis causas:")
    print("  - Navegador travou ou fechou")
    print("  - Sessao do Mind-7 expirou")
    print("  - Problemas de conexao")
    print("  - Estrutura da pagina mudou")
    print(f"\n{'='*80}")
    print("O que deseja fazer?")
    print("[1] Continuar tentando")
    print("[2] Pausar para revisar")
    print("[3] Cancelar processamento")
    print(f"{'='*80}")
    
    escolha = input("\nEscolha (1/2/3): ").strip()
    
    if escolha == "1":
        print("\n[OK] Continuando...")
        return "continuar"
    elif escolha == "2":
        print("\n[!] Processo pausado para revisao")
        print("[!] Verifique:")
        print("    1. Chrome esta aberto e respondendo")
        print("    2. Login no Mind-7 ainda esta ativo")
        print("    3. Nao ha popups ou alertas bloqueando")
        input("\nPressione ENTER apos revisar para continuar...")
        return "continuar"
    else:
        print("\n[X] Processamento cancelado pelo usuario")
        return "cancelar"

def extrair_dados_edital_pdf(caminho_pdf):
    print(f"\n{'='*80}")
    print(f"FASE 1: EXTRAÇÃO DE DADOS DO EDITAL PDF")
    print(f"{'='*80}")
    print(f"Arquivo: {caminho_pdf}")

    dados = []

    try:
        with open(caminho_pdf, 'rb') as arquivo:
            leitor = PyPDF2.PdfReader(arquivo)
            texto_completo = ""

            for pagina in leitor.pages:
                texto_completo += pagina.extract_text()

            print(f"\n[DEBUG] Primeiras 500 caracteres do PDF:")
            print(texto_completo[:500])
            print(f"\n{'='*80}\n")

            linhas = texto_completo.split('\n')

            publicacao = None
            for linha in linhas[:20]:
                if 'PUBLICADO' in linha.upper() or 'PUBLICAÇÃO' in linha.upper():
                    data_match = re.search(r'(\d{2}/\d{2}/\d{4})', linha)
                    if data_match:
                        publicacao = data_match.group(1)
                        print(f"[INFO] Data de publicacao encontrada: {publicacao}")
                        break

            for i, linha in enumerate(linhas):
                renach_match = re.search(r'(\d{11})', linha)

                if renach_match:
                    renach = renach_match.group(1)

                    nome_match = re.search(r'([A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜ\s]{5,})', linha)

                    todos_numeros = re.findall(r'\d+', linha)
                    processo = None
                    for num in todos_numeros:
                        if len(num) >= 7 and num != renach:
                            processo = num
                            break

                    if not processo:
                        processo = "N/A"

                    penalidade = "N/A"
                    linha_upper = linha.upper()
                    if 'SUSPENSÃO' in linha_upper or 'SUSPENSAO' in linha_upper:
                        penalidade = "SUSPENSÃO"
                    elif 'CASSAÇÃO' in linha_upper or 'CASSACAO' in linha_upper:
                        penalidade = "CASSAÇÃO"
                    elif 'MULTA' in linha_upper:
                        penalidade = "MULTA"
                    elif 'ADVERTÊNCIA' in linha_upper or 'ADVERTENCIA' in linha_upper:
                        penalidade = "ADVERTÊNCIA"

                    if i > 0:
                        linha_anterior = linhas[i-1].upper()
                        if 'SUSPENSÃO' in linha_anterior or 'SUSPENSAO' in linha_anterior:
                            penalidade = "SUSPENSÃO"
                        elif 'CASSAÇÃO' in linha_anterior or 'CASSACAO' in linha_anterior:
                            penalidade = "CASSAÇÃO"

                    if nome_match:
                        nome = nome_match.group(1).strip()

                        if len(nome) > 5:
                            dados.append({
                                'publicacao': publicacao or "N/A",
                                'nome': nome,
                                'renach': renach,
                                'processo': processo,
                                'penalidade': penalidade
                            })
                            print(f"  [+] {nome}")

    except Exception as e:
        print(f"[X] ERRO ao ler PDF: {e}")

    print(f"\n[OK] Total de pessoas encontradas: {len(dados)}")
    return dados

def conectar_chrome_debug():
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    tentativas = 0
    max_tentativas = 3

    while tentativas < max_tentativas:
        try:
            print(f"[!] Tentando conectar ao Chrome (tentativa {tentativas + 1}/{max_tentativas})...")
            driver = webdriver.Chrome(options=chrome_options)

            time.sleep(1)

            if verificar_saude_navegador(driver):
                print("[OK] Conectado ao Chrome com sucesso!")

                try:
                    url_atual = driver.current_url
                    print(f"[OK] URL atual: {url_atual[:60]}...")

                    if "mind-7.org" not in url_atual.lower():
                        print("[!] AVISO: Voce nao esta no site Mind-7")
                        print("[!] Acesse https://mind-7.org e faca login antes de continuar")
                except:
                    pass

                return driver
            else:
                print("[X] Chrome conectado mas nao esta respondendo")
                tentativas += 1

        except Exception as e:
            tentativas += 1
            erro_str = str(e)
            print(f"[X] Tentativa {tentativas}/{max_tentativas} falhou")

            if "cannot connect" in erro_str.lower() or "connection refused" in erro_str.lower():
                print("[!] Chrome nao esta rodando em modo debug")
                print("[!] Execute: iniciar_chrome_debug.bat")
            else:
                print(f"[!] Erro: {erro_str[:80]}")

            if tentativas < max_tentativas:
                print(f"[!] Tentando novamente em 3 segundos...")
                time.sleep(3)

    return None

def detectar_tipo_resultado(driver):
    max_tentativas = 5

    for tentativa in range(max_tentativas):
        try:
            if tentativa > 0:
                print(f"    [!] Tentativa {tentativa + 1}/{max_tentativas} - Aguardando pagina carregar...")
                time.sleep(4)

            try:
                driver.current_url
            except Exception as session_error:
                print(f"    [X] Sessao do navegador perdida: {session_error}")
                return "erro_sessao", 0, None

            try:
                WebDriverWait(driver, 15).until(
                    lambda d: d.execute_script("return document.readyState") == "complete"
                )
            except:
                print(f"    [!] Timeout aguardando carregamento completo")

            time.sleep(2)

            try:
                tabela = WebDriverWait(driver, 12).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "table.table"))
                )
            except:
                if tentativa < max_tentativas - 1:
                    print(f"    [!] Tabela nao encontrada, tentando novamente...")
                    continue
                else:
                    print(f"    [!] Tabela nao encontrada apos {max_tentativas} tentativas")
                    return "sem_resultado", 0, None

            time.sleep(1)

            linhas = tabela.find_elements(By.TAG_NAME, "tr")

            linhas_dados = [l for l in linhas if l.find_elements(By.TAG_NAME, "td")]

            if not linhas_dados:
                return "sem_resultado", 0, None

            if len(linhas_dados) == 1:
                return "unico", 1, linhas_dados[0]

            return "multiplo", len(linhas_dados), linhas_dados

        except Exception as e:
            if "invalid session id" in str(e).lower() or "session deleted" in str(e).lower():
                print(f"    [X] ERRO CRITICO: Navegador foi fechado ou sessao perdida")
                return "erro_sessao", 0, None

            if tentativa < max_tentativas - 1:
                print(f"    [!] Erro na tentativa {tentativa + 1}: {str(e)[:80]}")
                continue
            else:
                print(f"    [X] Erro apos {max_tentativas} tentativas: {str(e)[:100]}")
                return "erro", 0, None

    return "erro", 0, None

def extrair_cpf_da_linha(linha):
    try:
        colunas = linha.find_elements(By.TAG_NAME, "td")

        for coluna in colunas:
            links = coluna.find_elements(By.TAG_NAME, "a")
            for link in links:
                href = link.get_attribute("href")

                if href and "cpf/?documento=" in href:
                    cpf_match = re.search(r'documento=(\d{11})', href)
                    if cpf_match:
                        return cpf_match.group(1), link

                texto = link.text.strip()
                cpf_limpo = re.sub(r'[^\d]', '', texto)
                if len(cpf_limpo) == 11:
                    return cpf_limpo, link

        for coluna in colunas:
            texto = coluna.text.strip()
            cpf_limpo = re.sub(r'[^\d]', '', texto)
            if len(cpf_limpo) == 11:
                links = linha.find_elements(By.TAG_NAME, "a")
                if links:
                    return cpf_limpo, links[0]
                return cpf_limpo, coluna

        return None, None

    except Exception as e:
        print(f"    [X] Erro ao extrair CPF: {e}")
        return None, None

def abrir_pesquisas_mind7(driver, dados_edital):
    print(f"\n{'='*80}")
    print(f"FASE 2: PESQUISANDO NO MIND-7")
    print(f"{'='*80}")

    print(f"\n[INFO] Total: {len(dados_edital)} pessoas")
    print(f"[INFO] Pausa automatica a cada {PAUSAR_A_CADA} pessoas")
    print(f"[INFO] Ctrl+C para pausar manualmente")
    print(f"{'='*80}\n")

    url_pesquisa = "https://mind-7.org/painel/consultas/nome_v2/"
    resultados = []
    erros_consecutivos = 0

    for idx, pessoa in enumerate(dados_edital, 1):

        if idx > 1 and (idx - 1) % PAUSAR_A_CADA == 0:
            print(f"\n{'='*80}")
            print(f"PAUSA AUTOMATICA - {idx-1}/{len(dados_edital)} processadas")
            print(f"{'='*80}")

            if not verificar_saude_navegador(driver):
                print("\n[X] Navegador nao esta respondendo!")
                if perguntar_continuar_apos_erros(1) == "cancelar":
                    break

            if not pausar_processo():
                break

        print(f"[{idx}/{len(dados_edital)}] {pessoa['nome']}")

        resultado = {
            'indice': idx,
            'pessoa': pessoa,
            'url': None,
            'tipo_resultado': None,
            'quantidade': 0,
            'cpf': None,
            'subpagina_aberta': False,
            'status': 'pendente'
        }

        aba_pesquisa = None

        try:
            if not verificar_saude_navegador(driver):
                raise Exception("Navegador nao esta respondendo")

            driver.execute_script("window.open('');")
            driver.switch_to.window(driver.window_handles[-1])
            aba_pesquisa = driver.current_window_handle

            driver.get(url_pesquisa)
            time.sleep(3)

            resultado['url'] = driver.current_url

            campo_nome = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "nome"))
            )
            campo_nome.clear()
            campo_nome.send_keys(pessoa['nome'])

            try:
                botao_buscar = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.XPATH, "//button[@type='submit' or contains(text(), 'Buscar') or contains(text(), 'Pesquisar')]"))
                )

                driver.execute_script("arguments[0].scrollIntoView(true);", botao_buscar)
                time.sleep(0.5)

                try:
                    botao_buscar.click()
                except:
                    driver.execute_script("arguments[0].click();", botao_buscar)

            except Exception as e:
                print(f"  └─ [X] Erro ao clicar no botao: {e}")
                raise

            time.sleep(2)

            try:
                WebDriverWait(driver, 15).until(
                    lambda d: d.execute_script("return document.readyState") == "complete"
                )
            except:
                print(f"  └─ [!] Timeout aguardando pagina - continuando...")

            time.sleep(2)

            tipo, quantidade, dados = detectar_tipo_resultado(driver)
            resultado['tipo_resultado'] = tipo
            resultado['quantidade'] = quantidade

            if tipo == "erro_sessao":
                print(f"  └─ [X] ERRO CRITICO: Sessao do navegador perdida!")
                print(f"  └─ [!] O Chrome foi fechado ou a conexao foi perdida")
                resultado['status'] = 'erro_sessao_perdida'
                resultados.append(resultado)

                print(f"\n{'='*80}")
                print("ERRO CRITICO: NAVEGADOR DESCONECTADO")
                print(f"{'='*80}")
                print("\nO que aconteceu:")
                print("  - O Chrome foi fechado")
                print("  - A sessao de debug foi perdida")
                print("  - A conexao com o navegador foi interrompida")
                print(f"\n{'='*80}")
                print("Para continuar:")
                print("  1. Abra o Chrome novamente em modo debug")
                print("  2. Faca login no Mind-7")
                print("  3. Execute o script novamente")
                print(f"{'='*80}\n")
                break

            if tipo == "sem_resultado":
                print(f"  └─ Sem resultado - Fechando aba")
                resultado['status'] = 'sem_resultado'
                if len(driver.window_handles) > 1:
                    driver.close()
                    driver.switch_to.window(driver.window_handles[0])
                else:
                    driver.switch_to.window(driver.window_handles[0])
                erros_consecutivos = 0

            elif tipo == "multiplo":
                print(f"  └─ {quantidade} resultados - DESCARTADO - Fechando aba")
                resultado['status'] = 'multiplo_resultados_descartado'
                if len(driver.window_handles) > 1:
                    driver.close()
                    driver.switch_to.window(driver.window_handles[0])
                else:
                    driver.switch_to.window(driver.window_handles[0])
                erros_consecutivos = 0

            elif tipo == "unico":
                cpf, _ = extrair_cpf_da_linha(dados)

                if cpf:
                    url_cpf = f"https://mind-7.org/painel/consultas/cpf/?documento={cpf}"
                    driver.get(url_cpf)
                    time.sleep(3)

                    resultado['cpf'] = cpf
                    resultado['subpagina_aberta'] = True
                    resultado['status'] = 'processado_sucesso'

                    print(f"  └─ OK - CPF {cpf} aberto (aba mantida)")

                    driver.switch_to.window(driver.window_handles[0])
                    erros_consecutivos = 0
                else:
                    print(f"  └─ CPF nao encontrado - Fechando aba")
                    resultado['status'] = 'cpf_nao_encontrado'
                    if len(driver.window_handles) > 1:
                        driver.close()
                        driver.switch_to.window(driver.window_handles[0])
                    else:
                        driver.switch_to.window(driver.window_handles[0])
                    erros_consecutivos += 1

            else:
                resultado['status'] = 'erro_detectar'
                print(f"  └─ [!] Erro ao detectar resultado - Fechando aba")
                try:
                    if len(driver.window_handles) > 1:
                        driver.close()
                        driver.switch_to.window(driver.window_handles[0])
                    else:
                        driver.switch_to.window(driver.window_handles[0])
                except Exception as close_error:
                    print(f"  └─ [X] Erro ao fechar aba: {close_error}")
                    if "invalid session" in str(close_error).lower():
                        print(f"  └─ [X] NAVEGADOR DESCONECTADO - Encerrando...")
                        resultado['status'] = 'erro_sessao_perdida'
                        resultados.append(resultado)
                        break
                erros_consecutivos += 1

        except KeyboardInterrupt:
            print(f"\n\n[!] Pausado (Ctrl+C)")
            if aba_pesquisa and aba_pesquisa in driver.window_handles and len(driver.window_handles) > 1:
                driver.switch_to.window(aba_pesquisa)
                driver.close()
            driver.switch_to.window(driver.window_handles[0])

            if not pausar_processo():
                resultado['status'] = 'cancelado'
                resultados.append(resultado)
                break
            else:
                erros_consecutivos = 0

        except Exception as e:
            erro_str = str(e)
            print(f"  └─ [X] Erro: {erro_str[:100]}")

            if "invalid session" in erro_str.lower() or "session deleted" in erro_str.lower():
                print(f"  └─ [X] ERRO CRITICO: Navegador foi fechado!")
                resultado['status'] = 'erro_sessao_perdida'
                resultados.append(resultado)

                print(f"\n{'='*80}")
                print("ERRO CRITICO: NAVEGADOR DESCONECTADO")
                print(f"{'='*80}")
                print("\nO Chrome foi fechado ou a sessao foi perdida.")
                print("\nPara continuar:")
                print("  1. Abra o Chrome em modo debug novamente")
                print("  2. Faca login no Mind-7")
                print("  3. Execute o script novamente")
                print(f"{'='*80}\n")
                break

            resultado['status'] = 'erro'

            try:
                if not verificar_saude_navegador(driver):
                    print(f"  └─ [!] Navegador perdeu conexao - tentando recuperar...")
                    erros_consecutivos += 1
                    resultados.append(resultado)

                    if erros_consecutivos >= MAX_ERROS_CONSECUTIVOS:
                        acao = perguntar_continuar_apos_erros(erros_consecutivos)
                        if acao == "cancelar":
                            break
                        else:
                            erros_consecutivos = 0
                    continue

                if aba_pesquisa and aba_pesquisa in driver.window_handles and len(driver.window_handles) > 1:
                    driver.switch_to.window(aba_pesquisa)
                    driver.close()

                driver.switch_to.window(driver.window_handles[0])

            except Exception as cleanup_error:
                print(f"  └─ [!] Erro ao limpar aba: {str(cleanup_error)[:60]}")
                try:
                    if driver.window_handles:
                        driver.switch_to.window(driver.window_handles[0])
                except:
                    print(f"  └─ [X] Navegador completamente desconectado")
                    break

            erros_consecutivos += 1

        resultados.append(resultado)

        if erros_consecutivos >= MAX_ERROS_CONSECUTIVOS:
            acao = perguntar_continuar_apos_erros(erros_consecutivos)
            if acao == "cancelar":
                break
            else:
                erros_consecutivos = 0

    return resultados

def gerar_relatorio(dados_edital, resultados, caminho_pdf):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    arquivo_relatorio = f"relatorio_completo_{timestamp}.json"

    processados_sucesso = len([r for r in resultados if r['status'] == 'processado_sucesso'])
    sem_resultado = len([r for r in resultados if r['status'] == 'sem_resultado'])
    multiplos = len([r for r in resultados if r['status'] == 'multiplo_resultados'])
    erros = len([r for r in resultados if 'erro' in r['status']])
    cancelados = len([r for r in resultados if r['status'] == 'cancelado'])

    relatorio = {
        'data_execucao': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        'caminho_pdf': caminho_pdf,
        'total_pessoas': len(dados_edital),
        'processados': len(resultados),
        'processados_sucesso': processados_sucesso,
        'sem_resultado': sem_resultado,
        'multiplos_resultados': multiplos,
        'erros': erros,
        'cancelados': cancelados,
        'resultados': resultados
    }

    with open(arquivo_relatorio, 'w', encoding='utf-8') as f:
        json.dump(relatorio, f, ensure_ascii=False, indent=2)

    print(f"\n\n{'='*80}")
    print("RELATORIO FINAL")
    print(f"{'='*80}")
    
    total = len(resultados) if resultados else 1
    print(f"\nProcessadas: {len(resultados)}/{len(dados_edital)}")
    print(f"  [OK] Sucesso: {processados_sucesso} ({processados_sucesso*100//total}%)")
    print(f"  [!] Sem resultado: {sem_resultado} ({sem_resultado*100//total}%)")
    print(f"  [!] Multiplos: {multiplos} ({multiplos*100//total}%)")
    print(f"  [X] Erros: {erros} ({erros*100//total}%)")
    if cancelados > 0:
        print(f"  [-] Cancelados: {cancelados}")
    
    print(f"\nRelatorio: {arquivo_relatorio}")
    print(f"{'='*80}\n")

    return arquivo_relatorio

def main():
    limpar_tela()
    print("="*80)
    print("AUTOMACAO EDITAL > MIND-7 (COMPLETA)")
    print("="*80)
    print("\nPRE-REQUISITOS (EXECUTE ANTES):")
    print("  1. Execute manualmente: iniciar_chrome_debug.bat")
    print("  2. Acesse: https://mind-7.org")
    print("  3. Faca login no Mind-7")
    print("  4. Volte aqui e pressione ENTER")
    print("\nFLUXO:")
    print("  - Processar PDF do edital")
    print("  - Conectar ao Chrome em debug")
    print("  - Pesquisar todos os nomes automaticamente")
    print("  - Abrir CPF apenas para resultados unicos")
    print("="*80)

    input("\nPressione ENTER quando Chrome estiver aberto e logado no Mind-7...")

    caminho_pdf = input("\nCaminho do PDF do edital: ").strip().strip('"')

    if not caminho_pdf or not caminho_pdf.endswith('.pdf'):
        print("\n[X] Caminho invalido. Deve ser um arquivo .pdf")
        input("\nPressione ENTER para sair...")
        return

    dados_edital = extrair_dados_edital_pdf(caminho_pdf)

    if not dados_edital:
        print("\n[X] Nenhum dado extraido do PDF. Verifique o arquivo.")
        input("\nPressione ENTER para sair...")
        return

    print(f"\n{'='*80}")
    print("CONECTANDO AO CHROME")
    print(f"{'='*80}")

    driver = conectar_chrome_debug()

    if not driver:
        print("\n[X] Nao foi possivel conectar ao Chrome.")
        print("\n[!] SOLUCAO:")
        print("    1. Execute: iniciar_chrome_debug.bat")
        print("    2. Faca login no Mind-7")
        print("    3. Execute este script novamente")
        input("\nPressione ENTER para sair...")
        return

    try:
        resultados = abrir_pesquisas_mind7(driver, dados_edital)
        arquivo_relatorio = gerar_relatorio(dados_edital, resultados, caminho_pdf)

        print(f"\n[OK] Automacao concluida!")
        print(f"[OK] Abas permanecem abertas para analise")

    except KeyboardInterrupt:
        print(f"\n\n[!] Interrompido (Ctrl+C)")
        if 'resultados' in locals():
            gerar_relatorio(dados_edital, resultados, caminho_pdf)

    except Exception as e:
        print(f"\n[X] ERRO: {e}")
        if 'resultados' in locals():
            gerar_relatorio(dados_edital, resultados, caminho_pdf)

    input("\nPressione ENTER para sair...")

if __name__ == "__main__":
    main()
