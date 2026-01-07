# 📋 DOCUMENTAÇÃO COMPLETA - SISTEMA DE AUTOMAÇÃO DE EDITAIS

## 🎯 VISÃO GERAL DO SISTEMA

Sistema completo de automação para processamento de editais em PDF, pesquisa no Mind-7 e preparação para cadastro no Flow.

### Fluxo Completo:
```
EDITAL PDF → EXTRAÇÃO DE DADOS → PESQUISA MIND-7 → CLIQUE EM CPF → PREPARAÇÃO FLOW
   (Fase 1)        (Fase 1)           (Fase 2)         (Fase 2)      (Fase 3 - Futura)
```

---

## 📁 ARQUIVOS DO SISTEMA

### Scripts Principais:

1. **`automacao_completa_duas_fases.py`** ⭐ (NOVO)
   - Script unificado com Fase 1 e Fase 2
   - Extrai dados do PDF
   - Abre pesquisas no Mind-7
   - Clica automaticamente nos CPFs únicos
   - Gera relatório completo

2. **`processar_abas_clicar_cpf.py`**
   - Script standalone da Fase 2
   - Processa abas já abertas
   - Clica nos CPFs únicos

3. **`automacao_completa_interativa.py`**
   - Versão com memória persistente
   - Permite continuar processamento interrompido

### Arquivos de Suporte:

- **`iniciar_chrome_debug.bat`** - Inicia Chrome em modo debug
- **`abrir_chrome_debug.ps1`** - Script PowerShell alternativo
- **`requirements.txt`** - Dependências Python

---

## 🔧 DEPENDÊNCIAS E CONFIGURAÇÃO

### 1. Instalar Dependências Python:

```bash
pip install selenium
pip install PyPDF2
pip install webdriver-manager
```

### 2. Configurar Chrome em Modo Debug:

**Opção A - Arquivo BAT (Recomendado):**
```batch
@echo off
taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul
start chrome --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\AppData\Local\Google\Chrome\User Data"
```

**Opção B - PowerShell:**
```powershell
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process chrome -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=`"$env:USERPROFILE\AppData\Local\Google\Chrome\User Data`""
```

**Opção C - Linha de Comando:**
```bash
chrome --remote-debugging-port=9222 --user-data-dir="C:\Users\SEU_USUARIO\AppData\Local\Google\Chrome\User Data"
```

---

## 🚀 FASE 1: EXTRAÇÃO DE DADOS DO EDITAL

### Objetivo:
Extrair informações estruturadas do PDF do edital.

### Dados Extraídos:
- ✅ **Data de Publicação**
- ✅ **Nome Completo**
- ✅ **RENACH** (11 dígitos)
- ✅ **Número do Processo**
- ✅ **Tipo de Penalidade** (Suspensão, Cassação, Multa, Advertência)

### Padrões de Extração:

```python
# RENACH (11 dígitos)
r'(\d{11})'

# Nome completo (maiúsculas)
r'([A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜ\s]{5,})'

# Data de publicação
r'(\d{2}/\d{2}/\d{4})'

# Penalidades
- SUSPENSÃO / SUSPENSAO
- CASSAÇÃO / CASSACAO
- MULTA
- ADVERTÊNCIA / ADVERTENCIA
```

### Estrutura de Dados Gerada:

```python
{
    'publicacao': '22/12/2024',
    'nome': 'JOÃO DA SILVA SANTOS',
    'renach': '12345678901',
    'processo': '1234567',
    'penalidade': 'SUSPENSÃO'
}
```

---

## 🔍 FASE 2: PESQUISA NO MIND-7 E CLIQUE EM CPF

### Objetivo:
Pesquisar cada nome no Mind-7 e clicar automaticamente nos CPFs quando o resultado for único.

### Fluxo da Fase 2:

```
1. Conectar ao Chrome em modo debug
2. Para cada nome do edital:
   a. Abrir nova aba
   b. Acessar: https://mind-7.org/painel/consultas/nome_v2/
   c. Preencher campo "nome"
   d. Clicar em "Buscar"
   e. Aguardar resultado (3 segundos)
   f. Detectar tipo de resultado:
      - SEM RESULTADO → Registrar e pular
      - RESULTADO ÚNICO → Clicar no CPF e abrir subpágina
      - MÚLTIPLOS RESULTADOS → Registrar para análise manual
3. Gerar relatório JSON com todos os resultados
```

### Tipos de Resultado:

| Tipo | Descrição | Ação Automática |
|------|-----------|-----------------|
| **sem_resultado** | Nenhum registro encontrado | Nenhuma |
| **unico** | 1 registro encontrado | ✅ Clica no CPF |
| **multiplo** | 2+ registros encontrados | ⚠️ Análise manual |
| **erro** | Erro ao processar | ❌ Registra erro |

### Estrutura do Relatório:

```json
{
  "indice": 1,
  "url": "https://mind-7.org/painel/consultas/nome_v2/",
  "nome": "JOÃO DA SILVA SANTOS",
  "tipo_resultado": "unico",
  "quantidade": 1,
  "cpf": "123.456.789-00",
  "subpagina_aberta": true,
  "status": "processado_sucesso"
}
```

### Status Possíveis:

- ✅ **processado_sucesso** - CPF clicado, subpágina aberta
- ⚠️ **multiplo_resultados** - Múltiplos resultados, análise manual necessária
- ❌ **sem_resultado** - Nenhum resultado encontrado
- ❌ **erro_abrir_subpagina** - Erro ao abrir subpágina
- ⏭️ **pulado_nao_mind7** - Aba não é do Mind-7
- ⏭️ **pulado_nao_consulta** - Aba não é de consulta

---

## 📊 FASE 3: PREPARAÇÃO PARA FLOW (FUTURA)

### Objetivo:
Extrair dados das subpáginas abertas e preparar para cadastro no Flow.

### Dados a Extrair (Planejado):
- CPF completo
- Nome completo
- Data de nascimento
- Endereço completo
- Telefones
- E-mails
- Outros dados disponíveis

### Formato de Saída (Planejado):
- CSV para importação no Flow
- JSON para integração via API
- Excel para análise manual

---

## 🎮 COMO USAR O SISTEMA

### **Uso Básico - Script Completo (Fase 1 + Fase 2):**

```bash
# 1. Iniciar Chrome em modo debug
iniciar_chrome_debug.bat

# 2. Fazer login no Mind-7
# Acesse: https://mind-7.org
# Faça login manualmente

# 3. Executar automação completa
python automacao_completa_duas_fases.py

# 4. Informar caminho do PDF quando solicitado
# Exemplo: C:\Users\Usuario\Desktop\edital.pdf

# 5. Aguardar processamento completo
```

### **Uso Avançado - Apenas Fase 2 (Abas já abertas):**

```bash
# Se você já tem abas abertas com pesquisas do Mind-7:
python processar_abas_clicar_cpf.py
```

---

## 📈 RELATÓRIOS GERADOS

### 1. **Relatório de Extração (Fase 1)**
- **Arquivo**: Console output
- **Conteúdo**: Lista de nomes extraídos do PDF

### 2. **Relatório de Processamento (Fase 2)**
- **Arquivo**: `resultado_processamento_abas_YYYYMMDD_HHMMSS.json`
- **Conteúdo**: Detalhes de cada aba processada

### 3. **Relatório Consolidado (Fase 1 + Fase 2)**
- **Arquivo**: `relatorio_completo_YYYYMMDD_HHMMSS.json`
- **Conteúdo**: Dados do edital + resultados Mind-7

### Exemplo de Relatório Consolidado:

```json
{
  "data_execucao": "2024-12-22 15:30:00",
  "caminho_pdf": "C:\\editais\\edital_2024.pdf",
  "total_pessoas": 50,
  "processados_sucesso": 35,
  "multiplos_resultados": 10,
  "sem_resultado": 5,
  "pessoas": [
    {
      "nome": "JOÃO DA SILVA",
      "renach": "12345678901",
      "processo": "1234567",
      "penalidade": "SUSPENSÃO",
      "tipo_resultado": "unico",
      "cpf": "123.456.789-00",
      "status": "processado_sucesso"
    }
  ]
}
```

---

## 🔍 DETECÇÃO INTELIGENTE DE RESULTADOS

### Algoritmo de Detecção:

```python
def detectar_tipo_resultado(driver):
    # 1. Localiza tabela de resultados
    tabela = driver.find_element(By.CSS_SELECTOR, "table.table")
    
    # 2. Conta linhas com dados (ignora cabeçalho)
    linhas_dados = [l for l in linhas if l.find_elements(By.TAG_NAME, "td")]
    
    # 3. Classifica resultado
    if len(linhas_dados) == 0:
        return "sem_resultado"
    elif len(linhas_dados) == 1:
        return "unico"  # ✅ Clica automaticamente
    else:
        return "multiplo"  # ⚠️ Análise manual
```

### Extração de CPF:

```python
def extrair_cpf_da_linha(linha):
    # 1. Procura por padrão de CPF (###.###.###-##)
    # 2. Verifica se é um link clicável
    # 3. Retorna CPF e elemento para clicar
    
    pattern = r'\d{3}\.\d{3}\.\d{3}-\d{2}'
```

---

## ⚠️ TRATAMENTO DE ERROS

### Erros Comuns e Soluções:

| Erro | Causa | Solução |
|------|-------|---------|
| **Erro ao conectar ao Chrome** | Chrome não está em modo debug | Execute `iniciar_chrome_debug.bat` |
| **Elemento não encontrado** | Página não carregou completamente | Aumentar tempo de espera (sleep) |
| **Múltiplos resultados** | Nome muito comum | Análise manual necessária |
| **CPF não encontrado** | Estrutura da página mudou | Verificar seletores CSS |
| **Subpágina não abre** | Link não é clicável | Verificar estrutura HTML |

### Logs Detalhados:

O sistema gera logs detalhados no console:

```
[OK] Conectado ao Chrome!
[1/50] Pesquisando: JOÃO DA SILVA
  [OK] Aba criada
  Resultado: UNICO (1 registro(s))
  [OK] CPF: 123.456.789-00
  [OK] Subpagina aberta!
  [OK] Processado com sucesso!
```

---

## 🛠️ ESTRUTURA DO CÓDIGO

### Funções Principais - Fase 1:

```python
extrair_dados_edital_pdf(caminho_pdf)
# Extrai dados estruturados do PDF
# Retorna: lista de dicionários com dados das pessoas

conectar_chrome_debug()
# Conecta ao Chrome em modo debug
# Retorna: driver do Selenium

abrir_pesquisas_mind7(driver, dados_edital)
# Abre uma aba para cada pessoa e faz a pesquisa
# Retorna: lista de handles das abas criadas
```

### Funções Principais - Fase 2:

```python
detectar_tipo_resultado(driver)
# Analisa a tabela de resultados
# Retorna: ("unico"|"multiplo"|"sem_resultado", quantidade, dados)

extrair_cpf_da_linha(linha)
# Extrai CPF de uma linha da tabela
# Retorna: (cpf_texto, elemento_clicavel)

clicar_cpf_e_abrir_subpagina(driver, linha, nome_pessoa)
# Clica no CPF e abre subpágina em nova aba
# Retorna: (sucesso, cpf)

processar_aba(driver, handle, indice, total)
# Processa uma aba completa
# Retorna: dicionário com resultado
```

---

## 📝 PRÓXIMOS PASSOS (FASE 3)

### Funcionalidades Planejadas:

1. ✅ **Extração de Dados das Subpáginas**
   - CPF completo
   - Nome completo
   - Data de nascimento
   - Endereço
   - Telefones
   - E-mails

2. ✅ **Integração com Flow**
   - Exportar CSV para importação
   - API para cadastro automático
   - Validação de dados

3. ✅ **Melhorias de Performance**
   - Processamento paralelo
   - Cache de resultados
   - Retry automático em erros

4. ✅ **Interface Gráfica**
   - Dashboard de progresso
   - Visualização de resultados
   - Edição manual de dados

---

## 🔐 SEGURANÇA E BOAS PRÁTICAS

### Recomendações:

1. ✅ **Sempre use Chrome em modo debug** - Mantém sessão de login
2. ✅ **Faça backup dos relatórios JSON** - Histórico de processamentos
3. ✅ **Não compartilhe dados sensíveis** - CPFs são dados pessoais
4. ✅ **Respeite rate limits** - Aguarde 3 segundos entre pesquisas
5. ✅ **Valide dados extraídos** - Sempre revise resultados críticos

### Limitações Conhecidas:

- ⚠️ Requer login manual no Mind-7
- ⚠️ Não processa múltiplos resultados automaticamente
- ⚠️ Depende da estrutura HTML do Mind-7 (pode quebrar se mudarem o site)
- ⚠️ Não funciona com CAPTCHA

---

## 📞 SUPORTE E MANUTENÇÃO

### Arquivos de Log:

- **Console output** - Logs em tempo real
- **JSON reports** - Histórico de processamentos
- **Screenshots** - Capturas de tela em erros (futuro)

### Debugging:

```python
# Ativar modo debug detalhado
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Contato:

Para dúvidas ou melhorias, consulte a documentação técnica ou abra uma issue no repositório.

---

## 📊 ESTATÍSTICAS DE USO

### Métricas Coletadas:

- Total de editais processados
- Total de pessoas pesquisadas
- Taxa de sucesso (resultados únicos)
- Taxa de múltiplos resultados
- Taxa de não encontrados
- Tempo médio de processamento

### Exemplo de Relatório Final:

```
================================================================================
RELATORIO FINAL
================================================================================

Total de abas: 50
[OK] Processados com sucesso: 35 (70%)
[!] Sem resultado: 5 (10%)
[!] Multiplos resultados: 10 (20%)
[X] Erros: 0 (0%)
[-] Pulados: 0 (0%)

Relatorio salvo em: relatorio_completo_20241222_153000.json
================================================================================
```

---

## 🎯 RESUMO EXECUTIVO

### O que o sistema faz:

1. ✅ Lê PDF de edital e extrai dados estruturados
2. ✅ Pesquisa cada nome no Mind-7 automaticamente
3. ✅ Clica em CPFs únicos e abre subpáginas
4. ✅ Gera relatórios detalhados em JSON
5. ⏳ Prepara dados para cadastro no Flow (Fase 3 - Futura)

### Benefícios:

- ⚡ **Velocidade**: Processa 50 nomes em ~5 minutos
- 🎯 **Precisão**: Extração automática com validação
- 📊 **Rastreabilidade**: Relatórios completos de cada execução
- 🔄 **Continuidade**: Pode retomar processamento interrompido
- 🤖 **Automação**: Reduz trabalho manual em 80%

---

**Versão**: 2.0  
**Última Atualização**: 22/12/2024  
**Status**: Fase 1 e 2 Completas | Fase 3 em Planejamento
