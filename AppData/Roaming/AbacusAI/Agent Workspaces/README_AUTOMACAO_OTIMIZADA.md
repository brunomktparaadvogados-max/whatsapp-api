# 🚀 AUTOMAÇÃO OTIMIZADA - EDITAL PDF + MIND-7

## 📋 VISÃO GERAL

Sistema de automação **COMPLETO E OTIMIZADO** que processa editais em PDF, pesquisa nomes no Mind-7 e clica automaticamente nos CPFs encontrados.

### ✨ MELHORIAS IMPLEMENTADAS

Baseado em **TODOS os testes anteriores**, este sistema incorpora:

1. **Sistema de Etapas Sequenciais**
   - Cada etapa é executada de forma independente
   - Checkpoint automático após cada etapa
   - Possibilidade de retomar de onde parou

2. **Tratamento Robusto de Erros**
   - Detecção de sessão perdida do navegador
   - Retry automático em falhas temporárias
   - Logs detalhados de todos os erros

3. **Controle Inteligente de Abas**
   - Limite de abas simultâneas (padrão: 10)
   - Rate limiting entre pesquisas (padrão: 2 segundos)
   - Processamento em lotes para evitar sobrecarga

4. **Filtro Automático de Resultados**
   - Mantém abertas APENAS abas com resultado único
   - Fecha automaticamente abas com múltiplos resultados
   - Fecha automaticamente abas sem resultados

5. **Sistema de Checkpoint**
   - Salva progresso após cada etapa
   - Permite continuar execução interrompida
   - Arquivo JSON com estado completo

6. **Logs Detalhados**
   - Timestamp em cada operação
   - Níveis de log (INFO, SUCCESS, WARNING, ERROR)
   - Arquivo de log separado por execução

---

## 🎯 ETAPAS DA AUTOMAÇÃO

### ETAPA 1: Processamento do PDF
- Extrai: Nome, RENACH (11 dígitos), Processo, Data de Publicação
- Normaliza nomes (remove espaços extras)
- Valida dados extraídos
- Salva checkpoint

### ETAPA 2: Conexão com Navegador
- Conecta ao Chrome em modo debug (porta 9222)
- Verifica se Mind-7 está aberto
- Retry automático (3 tentativas)
- Valida sessão ativa

### ETAPA 3: Pesquisa de Nomes
- Abre cada nome em uma aba separada
- Controle de abas simultâneas (máx 10)
- Rate limiting entre pesquisas (2s)
- Processa lotes antes de continuar
- Fecha abas com múltiplos/nenhum resultado
- Mantém apenas abas com resultado único

### ETAPA 4: Clique nos CPFs
- Percorre todas as abas abertas
- Identifica abas com resultado único
- Clica automaticamente no CPF
- Valida sucesso do clique

### ETAPA 5: Relatório Final
- Gera relatório completo
- Lista todos os registros processados
- Estatísticas de execução

---

## 🔧 COMO USAR

### 1. Preparação (PRIMEIRA VEZ)

```powershell
# Instalar dependências
pip install selenium PyPDF2
```

### 2. Iniciar Chrome em Debug Mode

```powershell
.\iniciar_chrome_debug.bat
```

**OU manualmente:**

```powershell
# Fechar Chrome
taskkill /F /IM chrome.exe

# Aguardar 2 segundos

# Iniciar em debug mode
chrome --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\AppData\Local\Google\Chrome\User Data"
```

### 3. Acessar Mind-7

- Abra o Mind-7 no Chrome
- Faça login
- Mantenha a aba aberta

### 4. Executar Automação

**Opção A - Script PowerShell (RECOMENDADO):**

```powershell
.\EXECUTAR_AUTOMACAO_OTIMIZADA.ps1
```

**Opção B - Python Direto:**

```powershell
python automacao_otimizada_etapas.py
```

### 5. Informar Caminho do PDF

Quando solicitado, digite o caminho completo do PDF:

```
Digite o caminho do arquivo PDF do edital: C:\Users\Usuario\Downloads\edital.pdf
```

---

## 📊 ARQUIVOS GERADOS

### Durante a Execução:

- **`checkpoint_automacao.json`** - Estado atual da automação
  - Permite retomar execução interrompida
  - Contém dados extraídos e etapa atual

- **`log_automacao_YYYYMMDD_HHMMSS.txt`** - Log detalhado
  - Timestamp de cada operação
  - Erros e avisos
  - Progresso de cada etapa

### Ao Finalizar:

- **`relatorio_automacao_YYYYMMDD_HHMMSS.txt`** - Relatório final
  - Lista completa de registros
  - Estatísticas de processamento
  - Resumo de resultados

---

## 🛡️ TRATAMENTO DE ERROS

### Sessão do Navegador Perdida

**Problema:** Chrome foi fechado durante execução

**Solução Automática:**
- Detecta perda de sessão
- Salva checkpoint
- Exibe instruções para reconexão

**Como Retomar:**
1. Reinicie o Chrome em debug mode
2. Execute o script novamente
3. Escolha "S" para continuar do checkpoint

### Elemento Não Encontrado

**Problema:** Página não carregou completamente

**Solução Automática:**
- 5 tentativas com intervalo de 2s
- Timeout de 15 segundos
- Log detalhado do erro

### Múltiplas Abas Abertas

**Problema:** Muitas abas causam lentidão

**Solução Automática:**
- Limite de 10 abas simultâneas
- Processa lotes antes de continuar
- Fecha abas desnecessárias automaticamente

---

## ⚙️ CONFIGURAÇÕES AVANÇADAS

### Ajustar Limite de Abas Simultâneas

Edite `automacao_otimizada_etapas.py`:

```python
def etapa_3_pesquisar_nomes(self, intervalo_entre_abas=2, max_abas_simultaneas=10):
    # Altere max_abas_simultaneas para o valor desejado
    # Recomendado: 5-15 abas
```

### Ajustar Intervalo Entre Pesquisas

```python
def etapa_3_pesquisar_nomes(self, intervalo_entre_abas=2, max_abas_simultaneas=10):
    # Altere intervalo_entre_abas para o valor desejado (em segundos)
    # Recomendado: 1-3 segundos
```

### Ajustar Tentativas de Conexão

```python
def etapa_2_conectar_navegador(self, max_tentativas=3):
    # Altere max_tentativas para o valor desejado
    # Recomendado: 3-5 tentativas
```

---

## 🐛 SOLUÇÃO DE PROBLEMAS

### Erro: "Navegador não conectado"

**Causa:** Chrome não está em modo debug

**Solução:**
1. Feche TODOS os Chrome/Brave
2. Execute: `.\iniciar_chrome_debug.bat`
3. Aguarde o Chrome abrir
4. Execute a automação novamente

### Erro: "Aba do Mind-7 não encontrada"

**Causa:** Mind-7 não está aberto

**Solução:**
1. Abra o Mind-7 no Chrome
2. Faça login
3. A automação continuará automaticamente

### Erro: "Arquivo PDF não encontrado"

**Causa:** Caminho do PDF está incorreto

**Solução:**
1. Verifique o caminho completo do arquivo
2. Use aspas se o caminho tiver espaços
3. Exemplo: `"C:\Meus Documentos\edital.pdf"`

### Automação Travou

**Causa:** Possível problema de rede ou site lento

**Solução:**
1. Aguarde até 15 segundos (timeout automático)
2. Se não resolver, pressione Ctrl+C
3. Execute novamente e escolha continuar do checkpoint

---

## 📈 MELHORIAS EM RELAÇÃO ÀS VERSÕES ANTERIORES

| Recurso | Versão Antiga | Versão Otimizada |
|---------|---------------|------------------|
| **Checkpoint** | ❌ Não tinha | ✅ Automático após cada etapa |
| **Logs** | ⚠️ Básicos | ✅ Detalhados com timestamp |
| **Tratamento de Erros** | ⚠️ Genérico | ✅ Específico por tipo |
| **Controle de Abas** | ❌ Sem limite | ✅ Limite configurável |
| **Rate Limiting** | ❌ Não tinha | ✅ Intervalo entre pesquisas |
| **Detecção de Sessão** | ❌ Não detectava | ✅ Detecta e avisa |
| **Retry Automático** | ⚠️ 3 tentativas | ✅ 5 tentativas com backoff |
| **Filtro de Resultados** | ⚠️ Manual | ✅ Automático |
| **Relatório** | ⚠️ Básico | ✅ Completo e detalhado |

---

## 🎓 LIÇÕES APRENDIDAS DOS TESTES

### 1. Sessão do Navegador
- **Problema:** Navegador fechado causava crash
- **Solução:** Verificação de sessão antes de cada operação

### 2. Timeout de Elementos
- **Problema:** 10s não era suficiente
- **Solução:** Aumentado para 15s com 5 tentativas

### 3. Múltiplas Abas
- **Problema:** Muitas abas causavam lentidão
- **Solução:** Processamento em lotes de 10 abas

### 4. Resultados Múltiplos
- **Problema:** Abas com vários resultados ficavam abertas
- **Solução:** Fechamento automático, mantém apenas únicos

### 5. Perda de Progresso
- **Problema:** Falha perdia todo o trabalho
- **Solução:** Sistema de checkpoint automático

---

## 📞 SUPORTE

Se encontrar problemas:

1. Verifique o arquivo de log: `log_automacao_*.txt`
2. Verifique o checkpoint: `checkpoint_automacao.json`
3. Tente retomar do checkpoint
4. Se persistir, delete o checkpoint e execute do zero

---

## 🚀 PRÓXIMAS MELHORIAS POSSÍVEIS

- [ ] Integração com Flow (cadastro automático)
- [ ] Interface gráfica (GUI)
- [ ] Processamento paralelo real (threads)
- [ ] Exportação para Excel/CSV
- [ ] Notificações por email ao concluir
- [ ] Dashboard web de acompanhamento

---

**Versão:** 2.0 Otimizada  
**Data:** 2024  
**Status:** ✅ Produção
