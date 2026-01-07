from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, WebDriverException
import time
import re
import PyPDF2
import json
import os
from datetime import datetime
from pathlib import Path

class AutomacaoEditalMind7:
    def __init__(self):
        self.driver = None
        self.checkpoint_file = "checkpoint_automacao.json"
        self.log_file = f"log_automacao_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        self.dados_extraidos = []
        self.resultados = {}
        self.etapa_atual = 1

    def log(self, mensagem, nivel="INFO"):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_msg = f"[{timestamp}] [{nivel}] {mensagem}"
        print(log_msg)
        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(log_msg + '\n')

    def salvar_checkpoint(self):
        checkpoint = {
            'etapa_atual': self.etapa_atual,
            'dados_extraidos': self.dados_extraidos,
            'resultados': self.resultados,
            'timestamp': datetime.now().isoformat()
        }
        with open(self.checkpoint_file, 'w', encoding='utf-8') as f:
            json.dump(checkpoint, f, indent=2, ensure_ascii=False)
        self.log(f"Checkpoint salvo - Etapa {self.etapa_atual}")

    def carregar_checkpoint(self):
        if os.path.exists(self.checkpoint_file):
            try:
                with open(self.checkpoint_file, 'r', encoding='utf-8') as f:
                    checkpoint = json.load(f)
                self.etapa_atual = checkpoint.get('etapa_atual', 1)
                self.dados_extraidos = checkpoint.get('dados_extraidos', [])
                self.resultados = checkpoint.get('resultados', {})
                self.log(f"Checkpoint carregado - Retomando da Etapa {self.etapa_atual}", "SUCCESS")
                return True
            except Exception as e:
                self.log(f"Erro ao carregar checkpoint: {e}", "ERROR")
                return False
        return False

    def etapa_1_processar_pdf(self, caminho_pdf):
        self.log("="*80)
        self.log("ETAPA 1: PROCESSAMENTO DO PDF")
        self.log("="*80)
        if not os.path.exists(caminho_pdf):
            self.log(f"Arquivo PDF não encontrado: {caminho_pdf}", "ERROR")
            return False
        try:
            self.log(f"Lendo arquivo: {caminho_pdf}")
            with open(caminho_pdf, 'rb') as arquivo:
                leitor = PyPDF2.PdfReader(arquivo)
                total_paginas = len(leitor.pages)
                self.log(f"Total de páginas: {total_paginas}")
                for num_pagina, pagina in enumerate(leitor.pages, 1):
                    texto = pagina.extract_text()
                    linhas = texto.split('\n')
                    for linha in linhas:
                        linha_limpa = linha.strip()
                        if len(linha_limpa) < 10:
                            continue
                        match_completo = re.search(
                            r'(\d{2}/\d{2}/\d{4})\s+([A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜ\s]{5,}?)\s+(\d{11})\s+(\d+)',
                            linha_limpa
                        )
                        if match_completo:
                            data_pub = match_completo.group(1)
                            nome = match_completo.group(2).strip()
                            renach = match_completo.group(3)
                            processo = match_completo.group(4)
                            nome_normalizado = ' '.join(nome.split())
                            if len(nome_normalizado) >= 5:
                                registro = {
                                    'nome': nome_normalizado,
                                    'renach': renach,
                                    'processo': processo,
                                    'data_publicacao': data_pub,
                                    'pagina': num_pagina
                                }
                                self.dados_extraidos.append(registro)
                                self.log(f"  ✓ Extraído: {nome_normalizado} | RENACH: {renach}")
                    self.log(f"Página {num_pagina}/{total_paginas} processada")
            self.log(f"\n✓ ETAPA 1 CONCLUÍDA: {len(self.dados_extraidos)} registros extraídos", "SUCCESS")
            self.etapa_atual = 2
            self.salvar_checkpoint()
            return True
        except Exception as e:
            self.log(f"Erro ao processar PDF: {e}", "ERROR")
            return False

    def etapa_2_conectar_navegador(self, max_tentativas=3):
        self.log("="*80)
        self.log("ETAPA 2: CONEXÃO COM NAVEGADOR EM DEBUG MODE")
        self.log("="*80)
        for tentativa in range(1, max_tentativas + 1):
            try:
                self.log(f"Tentativa {tentativa}/{max_tentativas} de conexão...")
                chrome_options = Options()
                chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
                self.driver = webdriver.Chrome(options=chrome_options)
                abas_abertas = len(self.driver.window_handles)
                self.log(f"✓ Conectado! Abas abertas: {abas_abertas}")
                url_atual = self.driver.current_url
                self.log(f"URL atual: {url_atual}")
                aba_mind7_encontrada = False
                for handle in self.driver.window_handles:
                    self.driver.switch_to.window(handle)
                    if "mind-7.org" in self.driver.current_url:
                        aba_mind7_encontrada = True
                        self.log("✓ Aba do Mind-7 encontrada!", "SUCCESS")
                        break
                if not aba_mind7_encontrada:
                    self.log("AVISO: Aba do Mind-7 não encontrada. Abra manualmente antes de continuar.", "WARNING")
                    time.sleep(5)
                self.log("✓ ETAPA 2 CONCLUÍDA: Navegador conectado", "SUCCESS")
                self.etapa_atual = 3
                self.salvar_checkpoint()
                return True
            except Exception as e:
                self.log(f"Tentativa {tentativa} falhou: {e}", "ERROR")
                if tentativa < max_tentativas:
                    self.log(f"Aguardando 3 segundos antes da próxima tentativa...")
                    time.sleep(3)
                else:
                    self.log("INSTRUÇÕES:", "ERROR")
                    self.log("1. Feche todos os navegadores Chrome/Brave", "ERROR")
                    self.log("2. Execute: .\\iniciar_chrome_debug.bat", "ERROR")
                    self.log("3. Acesse o Mind-7 e faça login", "ERROR")
                    self.log("4. Execute este script novamente", "ERROR")
                    return False
        return False

    def verificar_sessao_ativa(self):
        try:
            _ = self.driver.current_url
            return True
        except:
            return False

    def etapa_3_pesquisar_nomes(self, intervalo_entre_abas=2, max_abas_simultaneas=10):
        self.log("="*80)
        self.log("ETAPA 3: PESQUISA DE NOMES NO MIND-7")
        self.log("="*80)
        if not self.driver:
            self.log("Navegador não conectado!", "ERROR")
            return False
        aba_mind7 = None
        for handle in self.driver.window_handles:
            self.driver.switch_to.window(handle)
            if "mind-7.org" in self.driver.current_url:
                aba_mind7 = handle
                break
        if not aba_mind7:
            self.log("Aba do Mind-7 não encontrada!", "ERROR")
            return False
        total_nomes = len(self.dados_extraidos)
        self.log(f"Total de nomes para pesquisar: {total_nomes}")
        abas_abertas = {}
        for idx, pessoa in enumerate(self.dados_extraidos, 1):
            nome = pessoa['nome']
            if not self.verificar_sessao_ativa():
                self.log("Sessão do navegador perdida!", "ERROR")
                self.salvar_checkpoint()
                return False
            try:
                self.log(f"[{idx}/{total_nomes}] Pesquisando: {nome}")
                self.driver.switch_to.window(aba_mind7)
                url_consulta = "https://mind-7.org/painel/consultas/nome_v2/"
                self.driver.execute_script(f"window.open('{url_consulta}', '_blank');")
                time.sleep(1.5)
                nova_aba = self.driver.window_handles[-1]
                self.driver.switch_to.window(nova_aba)
                campo_nome = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.ID, "nome"))
                )
                campo_nome.clear()
                campo_nome.send_keys(nome)
                botao_pesquisar = self.driver.find_element(By.XPATH, "//button[@type='submit']")
                botao_pesquisar.click()
                time.sleep(3)
                abas_abertas[nova_aba] = {
                    'nome': nome,
                    'pessoa': pessoa,
                    'processada': False
                }
                self.log(f"  ✓ Aba aberta para: {nome}")
                if len(abas_abertas) >= max_abas_simultaneas:
                    self.log(f"Limite de {max_abas_simultaneas} abas atingido. Processando antes de continuar...")
                    self.processar_abas_abertas(abas_abertas)
                    abas_abertas = {}
                time.sleep(intervalo_entre_abas)
            except Exception as e:
                self.log(f"Erro ao pesquisar {nome}: {e}", "ERROR")
                continue
        if abas_abertas:
            self.log("Processando abas restantes...")
            self.processar_abas_abertas(abas_abertas)
        self.log(f"✓ ETAPA 3 CONCLUÍDA: {total_nomes} pesquisas realizadas", "SUCCESS")
        self.etapa_atual = 4
        self.salvar_checkpoint()
        return True

    def processar_abas_abertas(self, abas_abertas):
        self.log(f"\nProcessando {len(abas_abertas)} abas abertas...")
        for aba, info in list(abas_abertas.items()):
            if info['processada']:
                continue
            nome = info['nome']
            try:
                self.driver.switch_to.window(aba)
                tipo_resultado = self.detectar_tipo_resultado()
                if tipo_resultado == "unico":
                    self.log(f"  ✓ [{nome}] Resultado ÚNICO encontrado")
                    info['tipo'] = 'unico'
                    info['processada'] = True
                elif tipo_resultado == "multiplo":
                    self.log(f"  ⚠ [{nome}] Múltiplos resultados - Fechando aba")
                    info['tipo'] = 'multiplo'
                    info['processada'] = True
                    self.fechar_aba_segura(aba)
                elif tipo_resultado == "nenhum":
                    self.log(f"  ✗ [{nome}] Nenhum resultado - Fechando aba")
                    info['tipo'] = 'nenhum'
                    info['processada'] = True
                    self.fechar_aba_segura(aba)
                else:
                    self.log(f"  ? [{nome}] Tipo desconhecido - Mantendo aba aberta")
                    info['tipo'] = 'desconhecido'
            except Exception as e:
                self.log(f"Erro ao processar aba de {nome}: {e}", "ERROR")
                info['tipo'] = 'erro'
                info['processada'] = True

    def detectar_tipo_resultado(self, max_tentativas=5):
        for tentativa in range(1, max_tentativas + 1):
            try:
                if not self.verificar_sessao_ativa():
                    return "erro_sessao"
                WebDriverWait(self.driver, 15).until(
                    EC.presence_of_element_located((By.TAG_NAME, "body"))
                )
                links_cpf = self.driver.find_elements(
                    By.XPATH,
                    "//a[contains(@href, '/painel/consultas/cpf/?documento=')]"
                )
                if len(links_cpf) == 0:
                    mensagens_erro = self.driver.find_elements(By.XPATH, "//*[contains(text(), 'Nenhum resultado')]")
                    if mensagens_erro:
                        return "nenhum"
                    if tentativa < max_tentativas:
                        time.sleep(2)
                        continue
                    return "nenhum"
                elif len(links_cpf) == 1:
                    return "unico"
                else:
                    return "multiplo"
            except TimeoutException:
                if tentativa < max_tentativas:
                    time.sleep(2)
                    continue
                return "timeout"
            except Exception as e:
                erro_str = str(e).lower()
                if "invalid session" in erro_str or "session deleted" in erro_str:
                    return "erro_sessao"
                if tentativa < max_tentativas:
                    time.sleep(2)
                    continue
                return "erro"
        return "desconhecido"

    def fechar_aba_segura(self, aba):
        try:
            if aba in self.driver.window_handles:
                self.driver.switch_to.window(aba)
                self.driver.close()
                if len(self.driver.window_handles) > 0:
                    self.driver.switch_to.window(self.driver.window_handles[0])
        except Exception as e:
            erro_str = str(e).lower()
            if "invalid session" in erro_str or "session deleted" in erro_str:
                self.log("Navegador desconectado ao fechar aba", "ERROR")

    def etapa_4_clicar_cpfs(self):
        self.log("="*80)
        self.log("ETAPA 4: CLIQUE AUTOMÁTICO NOS CPFs")
        self.log("="*80)
        if not self.driver:
            self.log("Navegador não conectado!", "ERROR")
            return False
        abas_atuais = self.driver.window_handles.copy()
        total_abas = len(abas_atuais)
        self.log(f"Total de abas abertas: {total_abas}")
        cpfs_clicados = 0
        for idx, aba in enumerate(abas_atuais, 1):
            try:
                if not self.verificar_sessao_ativa():
                    self.log("Sessão do navegador perdida!", "ERROR")
                    self.salvar_checkpoint()
                    return False
                self.driver.switch_to.window(aba)
                url_atual = self.driver.current_url
                if "mind-7.org" not in url_atual or "consultas/nome" not in url_atual:
                    continue
                self.log(f"[{idx}/{total_abas}] Processando aba...")
                links_cpf = self.driver.find_elements(
                    By.XPATH,
                    "//a[contains(@href, '/painel/consultas/cpf/?documento=')]"
                )
                if len(links_cpf) == 1:
                    cpf_url = links_cpf[0].get_attribute('href')
                    cpf_numero = re.search(r'documento=(\d+)', cpf_url)
                    if cpf_numero:
                        cpf = cpf_numero.group(1)
                        self.log(f"  ✓ Clicando no CPF: {cpf}")
                        links_cpf[0].click()
                        time.sleep(2)
                        cpfs_clicados += 1
                    else:
                        self.log(f"  ⚠ CPF não identificado na URL")
                else:
                    self.log(f"  ⚠ Aba com {len(links_cpf)} resultados - Pulando")
            except Exception as e:
                self.log(f"Erro ao processar aba {idx}: {e}", "ERROR")
                continue
        self.log(f"✓ ETAPA 4 CONCLUÍDA: {cpfs_clicados} CPFs clicados", "SUCCESS")
        self.etapa_atual = 5
        self.salvar_checkpoint()
        return True

    def gerar_relatorio_final(self):
        self.log("="*80)
        self.log("RELATÓRIO FINAL")
        self.log("="*80)
        self.log(f"Total de registros extraídos do PDF: {len(self.dados_extraidos)}")
        self.log(f"Etapa final alcançada: {self.etapa_atual}")
        relatorio_file = f"relatorio_automacao_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        with open(relatorio_file, 'w', encoding='utf-8') as f:
            f.write("="*80 + '\n')
            f.write("RELATÓRIO DE AUTOMAÇÃO - EDITAL + MIND-7\n")
            f.write("="*80 + '\n\n')
            f.write(f"Data/Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Total de registros: {len(self.dados_extraidos)}\n\n")
            f.write("REGISTROS EXTRAÍDOS:\n")
            f.write("-"*80 + '\n')
            for idx, pessoa in enumerate(self.dados_extraidos, 1):
                f.write(f"{idx}. {pessoa['nome']}\n")
                f.write(f"   RENACH: {pessoa['renach']}\n")
                f.write(f"   Processo: {pessoa['processo']}\n")
                f.write(f"   Data Publicação: {pessoa['data_publicacao']}\n\n")
        self.log(f"Relatório salvo em: {relatorio_file}", "SUCCESS")
        self.log("="*80)

    def executar_automacao_completa(self, caminho_pdf):
        self.log("="*80)
        self.log("INICIANDO AUTOMAÇÃO COMPLETA - EDITAL + MIND-7")
        self.log("="*80)
        if self.carregar_checkpoint():
            resposta = input("\nCheckpoint encontrado! Deseja continuar de onde parou? (s/n): ")
            if resposta.lower() != 's':
                self.etapa_atual = 1
                self.dados_extraidos = []
                self.resultados = {}
        if self.etapa_atual <= 1:
            if not self.etapa_1_processar_pdf(caminho_pdf):
                self.log("Falha na Etapa 1", "ERROR")
                return False
        if self.etapa_atual <= 2:
            if not self.etapa_2_conectar_navegador():
                self.log("Falha na Etapa 2", "ERROR")
                return False
        if self.etapa_atual <= 3:
            if not self.etapa_3_pesquisar_nomes():
                self.log("Falha na Etapa 3", "ERROR")
                return False
        if self.etapa_atual <= 4:
            if not self.etapa_4_clicar_cpfs():
                self.log("Falha na Etapa 4", "ERROR")
                return False
        self.gerar_relatorio_final()
        self.log("="*80)
        self.log("✓ AUTOMAÇÃO CONCLUÍDA COM SUCESSO!", "SUCCESS")
        self.log("="*80)
        return True

def main():
    print("="*80)
    print("AUTOMAÇÃO OTIMIZADA - EDITAL PDF + MIND-7")
    print("="*80)
    print()
    caminho_pdf = input("Digite o caminho do arquivo PDF do edital: ").strip().strip('"')
    if not os.path.exists(caminho_pdf):
        print(f"\n[ERRO] Arquivo não encontrado: {caminho_pdf}")
        return
    automacao = AutomacaoEditalMind7()
    automacao.executar_automacao_completa(caminho_pdf)

if __name__ == "__main__":
    main()
