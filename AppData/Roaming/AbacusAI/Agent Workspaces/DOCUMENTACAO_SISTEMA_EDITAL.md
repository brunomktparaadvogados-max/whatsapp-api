# 📋 DOCUMENTAÇÃO COMPLETA - SISTEMA DE PROCESSAMENTO DE EDITAIS

## 🎯 OBJETIVO DO SISTEMA

Automatizar a extração de dados de editais em PDF e realizar pesquisas no site Mind7, com sistema de memória persistente para continuar processamentos interrompidos.

---

## 📁 ARQUIVOS DO SISTEMA

### 1. **Script Principal**
- **Arquivo**: `C:\Users\55119\Desktop\processar_abas_cpf_exportar_flow.py`
- **Linguagem**: Python 3
- **Função**: Extrai dados de PDF, pesquisa no Mind7, clica em CPFs e salva progresso

### 2. **Banco de Dados**
- **Arquivo**: `processamento_editais.db` (SQLite)
- **Localização**: Mesmo diretório do script
- **Função**: Armazena histórico de processamentos e nomes já pesquisados

### 3. **Arquivo Excel**
- **Arquivo**: `dados_edital.xlsx`
- **Função**: Exporta dados extraídos do PDF em formato tabular

---

## 🗄️ ESTRUTURA DO BANCO DE DADOS

### Tabela: `processamentos`
```sql
CREATE TABLE processamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caminho_pdf TEXT NOT NULL,
    data_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_fim TIMESTAMP,
    total_nomes INTEGER,
    nomes_processados INTEGER DEFAULT 0,
    status TEXT DEFAULT 'em_andamento'
);
```

**Campos:**
- `id`: ID único do processamento
- `caminho_pdf`: Caminho completo do arquivo PDF processado
- `data_inicio`: Data/hora de início
- `data_fim`: Data/hora de conclusão
- `total_nomes`: Total de nomes extraídos do PDF
- `nomes_processados`: Quantidade já pesquisada no Mind7
- `status`: `em_andamento` ou `concluido`

### Tabela: `nomes_processados`
```sql
CREATE TABLE nomes_processados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    processamento_id INTEGER,
    ordem INTEGER,
    nome TEXT NOT NULL,
    renach TEXT,
    numero_processo TEXT,
    penalidade TEXT,
    data_publicacao TEXT,
    cpf_encontrado TEXT,
    url_detalhes TEXT,
    data_processamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pendente',
    FOREIGN KEY (processamento_id) REFERENCES processamentos(id)
);
```

**Campos:**
- `id`: ID único do nome
- `processamento_id`: Referência ao processamento pai
- `ordem`: Ordem no PDF original (preserva sequência)
- `nome`: Nome completo extraído
- `renach`: CNH/RENACH extraído
- `numero_processo`: Número do processo
- `penalidade`: Tipo de penalidade
- `data_publicacao`: Data da publicação
- `cpf_encontrado`: CPF encontrado no Mind7 (ou status)
- `url_detalhes`: URL da página de detalhes do CPF
- `data_processamento`: Data/hora da pesquisa
- `status`: `pendente` ou `processado`

---

## 🔧 DEPENDÊNCIAS DO SISTEMA

### Bibliotecas Python Necessárias:
```bash
pip install PyPDF2
pip install pandas
pip install openpyxl
pip install selenium
```

### Chrome em Modo Debug:
O Chrome deve estar rodando com:
```powershell
start chrome --remote-debugging-port=9222 --user-data-dir="C:\Users\55119\AppData\Local\Google\Chrome\User Data"
```

**⚠️ IMPORTANTE**: O Chrome deve estar **logado no Mind7** antes de executar o script.

---

## 🚀 COMO USAR O SISTEMA

### **Primeira Execução (Novo PDF)**

1. **Abrir Chrome em modo debug**:
```powershell
taskkill /F /IM chrome.exe
start chrome --remote-debugging-port=9222 --user-data-dir="C:\Users\55119\AppData\Local\Google\Chrome\User Data"
```

2. **Fazer login no Mind7**:
   - Acesse: https://mind-7.org/painel/consultas/nome_v2/
   - Faça login normalmente

3. **Executar o script**:
```powershell
python C:\Users\55119\Desktop\processar_abas_cpf_exportar_flow.py
```

4. **Informar caminho do PDF**:
```
Digite o caminho completo do PDF do edital: C:\caminho\do\arquivo.pdf
```

5. **Confirmar pesquisa**:
```
🔍 Deseja pesquisar X nomes no Mind7? (s/n): s
```

---

### **Continuar Processamento Interrompido**

1. **Executar o script novamente**:
```powershell
python C:\Users\55119\Desktop\processar_abas_cpf_exportar_flow.py
```

2. **Sistema detecta processamento pendente**:
```
📋 PROCESSAMENTO PENDENTE ENCONTRADO:
   Arquivo: C:\caminho\do\arquivo.pdf
   Progresso: 15/50 nomes processados

Deseja continuar este processamento? (s/n): s
```

3. **Confirmar continuação**:
```
Deseja pesquisar os 35 nomes restantes no Mind7? (s/n): s
```

4. **Sistema continua de onde parou** (pula nomes já processados)

---

## 🔍 FUNCIONAMENTO DETALHADO

### **Fase 1: Extração de Dados do PDF**

O script extrai do PDF:
- **Data da publicação**
- **Nome completo**
- **RENACH/CNH**
- **Número do processo**
- **Tipo de penalidade**

**Padrões Regex Utilizados:**
```python
# Nome completo
r'([A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜ][A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜa-zàáâãäåçèéêëìíîïñòóôõöùúûü\s]+(?:\s+(?:DA|DE|DO|DOS|DAS|E)\s+)?[A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜ][A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜa-zàáâãäåçèéêëìíîïñòóôõöùúûü]+)'

# RENACH/CNH
r'(\d{11})'

# Número do processo
r'(\d{2}\.\d{3}\.\d{6}/\d{4}-\d{2})'

# Penalidade
r'(SUSPENSÃO DO DIREITO DE DIRIGIR|CASSAÇÃO DA CNH|ADVERTÊNCIA POR ESCRITO)'
```

### **Fase 2: Salvamento no Banco de Dados**

1. Cria registro em `processamentos`
2. Salva todos os nomes em `nomes_processados` com status `pendente`
3. Preserva a ordem original do PDF

### **Fase 3: Pesquisa no Mind7**

Para cada nome pendente:

1. **Abre nova aba no Chrome**
2. **Navega para**: `https://mind-7.org/painel/consultas/nome_v2/`
3. **Preenche campo de nome**
4. **Clica em "Consultar"**
5. **Aguarda 3 segundos**
6. **Verifica resultados**:
   - **1 resultado**: Clica no CPF, salva CPF e URL
   - **Múltiplos resultados**: Não clica, salva "X resultados"
   - **Nenhum resultado**: Salva "Não encontrado"
7. **Atualiza status no banco**: `pendente` → `processado`
8. **Incrementa contador** de progresso

### **Fase 4: Finalização**

1. Marca processamento como `concluido`
2. Mantém todas as abas abertas no Chrome
3. Exibe resumo final

---

## 📊 CONSULTAS ÚTEIS NO BANCO DE DADOS

### Ver todos os processamentos:
```sql
SELECT * FROM processamentos ORDER BY data_inicio DESC;
```

### Ver progresso do último processamento:
```sql
SELECT 
    caminho_pdf,
    nomes_processados || '/' || total_nomes as progresso,
    status
FROM processamentos 
WHERE status = 'em_andamento'
ORDER BY data_inicio DESC 
LIMIT 1;
```

### Ver nomes pendentes:
```sql
SELECT nome, renach, numero_processo 
FROM nomes_processados 
WHERE processamento_id = 1 AND status = 'pendente'
ORDER BY ordem;
```

### Ver nomes com CPF encontrado:
```sql
SELECT nome, cpf_encontrado, url_detalhes 
FROM nomes_processados 
WHERE cpf_encontrado IS NOT NULL 
  AND cpf_encontrado NOT IN ('Não encontrado', 'Erro')
ORDER BY ordem;
```

### Ver estatísticas:
```sql
SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN cpf_encontrado NOT IN ('Não encontrado', 'Erro') THEN 1 ELSE 0 END) as com_cpf,
    SUM(CASE WHEN cpf_encontrado LIKE '%resultados' THEN 1 ELSE 0 END) as multiplos,
    SUM(CASE WHEN cpf_encontrado = 'Não encontrado' THEN 1 ELSE 0 END) as nao_encontrados
FROM nomes_processados
WHERE processamento_id = 1;
```

---

## 🛠️ FUNÇÕES PRINCIPAIS DO SCRIPT

### **Banco de Dados**
- `inicializar_db()` - Cria tabelas se não existirem
- `obter_processamento_pendente()` - Busca processamento em andamento
- `criar_processamento(caminho_pdf, total_nomes)` - Cria novo processamento
- `salvar_nomes_no_db(processamento_id, dados)` - Salva nomes extraídos
- `obter_nomes_pendentes(processamento_id)` - Retorna nomes não processados
- `marcar_nome_processado(nome_id, cpf, url)` - Atualiza status do nome
- `atualizar_progresso(processamento_id)` - Incrementa contador
- `finalizar_processamento(processamento_id)` - Marca como concluído

### **Extração de Dados**
- `extrair_texto_pdf(caminho_pdf)` - Extrai texto do PDF
- `extrair_dados_edital(texto)` - Aplica regex e estrutura dados

### **Automação Mind7**
- `pesquisar_mind7_com_clique_cpf(processamento_id, nomes_pendentes)` - Automação completa

### **Exportação**
- `salvar_dados(dados, caminho_saida)` - Gera Excel

---

## 🔄 FLUXO COMPLETO DO SISTEMA

```
┌─────────────────────────────────────────────────────────────┐
│ 1. INICIALIZAÇÃO                                            │
│    - Inicializa banco de dados SQLite                       │
│    - Verifica se há processamento pendente                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. DECISÃO: CONTINUAR OU NOVO?                              │
│    ┌─────────────────┐         ┌─────────────────┐         │
│    │ Processamento   │   SIM   │ Continuar de    │         │
│    │ pendente?       ├────────►│ onde parou      │         │
│    └────────┬────────┘         └─────────────────┘         │
│             │ NÃO                                           │
│             ▼                                               │
│    ┌─────────────────┐                                     │
│    │ Solicitar novo  │                                     │
│    │ PDF             │                                     │
│    └─────────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. EXTRAÇÃO DE DADOS                                        │
│    - Lê PDF página por página                               │
│    - Aplica regex para extrair:                             │
│      • Data publicação                                      │
│      • Nome completo                                        │
│      • RENACH/CNH                                           │
│      • Número processo                                      │
│      • Penalidade                                           │
│    - Preserva ordem original                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. SALVAMENTO                                               │
│    - Cria registro em 'processamentos'                      │
│    - Salva nomes em 'nomes_processados' (status: pendente)  │
│    - Exporta para Excel                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. CONFIRMAÇÃO DO USUÁRIO                                   │
│    "Deseja pesquisar X nomes no Mind7? (s/n)"               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. AUTOMAÇÃO MIND7 (Para cada nome pendente)                │
│    ┌─────────────────────────────────────────────────────┐ │
│    │ a) Conecta ao Chrome (porta 9222)                   │ │
│    │ b) Abre nova aba                                    │ │
│    │ c) Navega para Mind7                                │ │
│    │ d) Preenche campo nome                              │ │
│    │ e) Clica "Consultar"                                │ │
│    │ f) Aguarda 3 segundos                               │ │
│    │ g) Verifica quantidade de resultados:               │ │
│    │    ┌──────────────────────────────────────────┐    │ │
│    │    │ 1 resultado  → Clica no CPF              │    │ │
│    │    │ Múltiplos    → Não clica                 │    │ │
│    │    │ Nenhum       → Registra "Não encontrado" │    │ │
│    │    └──────────────────────────────────────────┘    │ │
│    │ h) Salva resultado no banco                         │ │
│    │ i) Marca como 'processado'                          │ │
│    │ j) Atualiza contador de progresso                   │ │
│    └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. FINALIZAÇÃO                                              │
│    - Marca processamento como 'concluido'                   │
│    - Exibe resumo                                           │
│    - Mantém abas abertas no Chrome                          │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚠️ PROBLEMAS COMUNS E SOLUÇÕES

### **Erro: "IndentationError"**
**Causa**: Indentação incorreta no código Python  
**Solução**: Recriar o arquivo ou corrigir espaços/tabs

### **Erro: "driver is not defined"**
**Causa**: Selenium não conseguiu conectar ao Chrome  
**Solução**: 
1. Verificar se Chrome está rodando com `--remote-debugging-port=9222`
2. Instalar Selenium: `pip install selenium`

### **Erro: "Campo não encontrado"**
**Causa**: Mind7 mudou estrutura HTML  
**Solução**: Atualizar seletores CSS no script (linhas 292-296)

### **Chrome abre nova instância**
**Causa**: User data dir incorreto  
**Solução**: Usar exatamente: `C:\Users\55119\AppData\Local\Google\Chrome\User Data`

### **Nomes não são encontrados**
**Causa**: Regex não corresponde ao formato do PDF  
**Solução**: Ajustar padrões regex na função `extrair_dados_edital()`

---

## 📝 EXEMPLO DE SAÍDA DO SISTEMA

```
======================================================================
  PROCESSADOR DE EDITAIS - MIND7
======================================================================

📋 PROCESSAMENTO PENDENTE ENCONTRADO:
   Arquivo: C:\editais\edital_2024.pdf
   Progresso: 15/50 nomes processados

Deseja continuar este processamento? (s/n): s

✓ Continuando processamento...
✓ 35 nomes restantes

Deseja pesquisar os 35 nomes restantes no Mind7? (s/n): s

Conectando ao Chrome em modo debug...
✓ Conectado ao Chrome com Selenium

Iniciando pesquisas no Mind7...
Total de pesquisas pendentes: 35

[ 16/ 50] ✓ JOÃO DA SILVA → CPF: 123.456.789-00 (CLICADO)
[ 17/ 50] ⚠ MARIA SANTOS → 3 resultados (NÃO CLICADO)
[ 18/ 50] ✗ PEDRO OLIVEIRA → Nenhum resultado
[ 19/ 50] ✓ ANA COSTA → CPF: 987.654.321-00 (CLICADO)
...

✓ Processamento concluído!
✓ Todas as abas estão abertas no Chrome

⚠ NÃO FECHE O NAVEGADOR - Revise as abas abertas

======================================================================
✅ PROCESSO CONCLUÍDO COM SUCESSO!
======================================================================
   • 50 nomes extraídos
   • Pesquisas realizadas no Mind7
   • Dados salvos em: dados_edital.xlsx
   • Banco de dados: processamento_editais.db
```

---

## 🔐 SEGURANÇA E BOAS PRÁTICAS

1. **Não compartilhe o banco de dados** - Contém dados pessoais (CPFs)
2. **Backup regular** - Copie `processamento_editais.db` periodicamente
3. **Chrome logado** - Mantenha sessão ativa no Mind7
4. **Não feche abas** - Revise manualmente antes de fechar
5. **Validação manual** - Sempre confira resultados com múltiplos CPFs

---

## 📞 INFORMAÇÕES PARA CONTINUIDADE

### **Se o terminal fechar:**
1. Reabra o terminal
2. Execute: `python C:\Users\55119\Desktop\processar_abas_cpf_exportar_flow.py`
3. Sistema detecta automaticamente o processamento pendente
4. Escolha "s" para continuar

### **Se o Chrome fechar:**
1. Reabra Chrome em modo debug:
```powershell
start chrome --remote-debugging-port=9222 --user-data-dir="C:\Users\55119\AppData\Local\Google\Chrome\User Data"
```
2. Faça login no Mind7
3. Execute o script novamente

### **Para verificar progresso:**
Use SQLite Browser ou execute:
```sql
SELECT nomes_processados, total_nomes, status 
FROM processamentos 
ORDER BY data_inicio DESC LIMIT 1;
```

---

## 📦 BACKUP E RESTAURAÇÃO

### **Fazer Backup:**
```powershell
copy processamento_editais.db processamento_editais_backup.db
copy dados_edital.xlsx dados_edital_backup.xlsx
```

### **Restaurar Backup:**
```powershell
copy processamento_editais_backup.db processamento_editais.db
```

---

## 🎓 RESUMO PARA ABACUS AI

**Contexto**: Sistema de automação para extrair dados de editais em PDF e pesquisar no Mind7.

**Arquivos Críticos**:
- Script: `C:\Users\55119\Desktop\processar_abas_cpf_exportar_flow.py`
- Banco: `processamento_editais.db` (SQLite)
- Excel: `dados_edital.xlsx`

**Comando Principal**:
```powershell
python C:\Users\55119\Desktop\processar_abas_cpf_exportar_flow.py
```

**Pré-requisitos**:
1. Chrome em debug mode (porta 9222)
2. Logado no Mind7
3. Bibliotecas: PyPDF2, pandas, openpyxl, selenium

**Funcionalidade de Memória**:
- Sistema detecta automaticamente processamentos interrompidos
- Pergunta se deseja continuar ou iniciar novo
- Pula nomes já processados
- Mantém histórico completo no SQLite

**Comportamento**:
- 1 resultado → Clica no CPF automaticamente
- Múltiplos → Não clica, registra quantidade
- Nenhum → Registra "Não encontrado"

**Para Continuar Trabalho**:
1. Execute o script
2. Sistema mostra processamento pendente
3. Confirme continuação
4. Sistema retoma de onde parou

---

**Documento criado em**: 2024  
**Versão do Sistema**: 1.0  
**Última atualização**: Implementação completa com memória persistente
