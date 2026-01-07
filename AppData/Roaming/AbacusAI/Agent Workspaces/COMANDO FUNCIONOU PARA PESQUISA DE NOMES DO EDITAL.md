# ✅ AUTOMAÇÃO SIMPLES - VERSÃO QUE FUNCIONA

## 🚀 INÍCIO RÁPIDO (3 PASSOS)

### 1️⃣ Inicie o Chrome
```
Clique duas vezes em: INICIAR_CHROME.bat
```
Aguarde a mensagem: "CHROME DEBUG ATIVO - PORTA 9222"

### 2️⃣ Faça login no Mind-7
- O Chrome abrirá automaticamente em https://mind-7.org
- Faça login normalmente
- Resolva o Cloudflare se aparecer

### 3️⃣ Execute a automação
```bash
python automacao_simples.py
```

## 📋 O QUE A AUTOMAÇÃO FAZ

1. **Conecta ao Chrome** que você abriu
2. **Lê o PDF** do edital e extrai os nomes
3. **Abre uma aba** para cada nome no Mind-7
4. **Preenche e pesquisa** automaticamente
5. **Mantém todas as abas abertas** para você revisar

## ⚙️ COMO USAR

```bash
# 1. Inicie o Chrome
INICIAR_CHROME.bat

# 2. Faça login no Mind-7

# 3. Execute
python automacao_simples.py

# 4. Informe o caminho do PDF quando solicitado
```

## 📁 ARQUIVOS NECESSÁRIOS

- `INICIAR_CHROME.bat` - Inicia Chrome em modo debug
- `automacao_simples.py` - Script principal (SIMPLES)

## ❌ SE DER ERRO

### Erro: "cannot connect to chrome at 127.0.0.1:9222"

**Solução:**
1. Feche TODOS os Chrome: `taskkill /F /IM chrome.exe`
2. Execute: `INICIAR_CHROME.bat`
3. Aguarde 5 segundos
4. Tente novamente

### Erro: "Arquivo não encontrado"

**Solução:**
- Use o caminho completo do PDF
- Exemplo: `C:\Users\SeuNome\Downloads\edital.pdf`
- Ou arraste o arquivo para o terminal

### Erro: "Nenhum nome extraído"

**Solução:**
- Verifique se o PDF está no formato correto
- O PDF deve ter linhas com: DATA NOME NUMERO NUMERO

## 🎯 DIFERENÇA DESTA VERSÃO

### ❌ Versão Complicada (automacao_completa_duas_fases.py)
- Muitas verificações
- Tratamento de erros complexo
- Difícil de debugar
- Muitas mensagens

### ✅ Versão Simples (automacao_simples.py)
- Código limpo e direto
- Faz exatamente o que precisa
- Fácil de entender
- Funciona!

## 📝 EXEMPLO DE USO

```
C:\> INICIAR_CHROME.bat
[Aguarde Chrome abrir]
[Faça login no Mind-7]

C:\> python automacao_simples.py

AUTOMACAO SIMPLES - EDITAL > MIND-7
================================================================================
PRE-REQUISITOS:
  1. Execute: INICIAR_CHROME.bat
  2. Faca login no Mind-7
  3. Volte aqui
================================================================================

Pressione ENTER quando estiver pronto...

[1] Conectando ao Chrome em modo debug...
[OK] Conectado! Abas abertas: 1

Caminho do PDF do edital: C:\Downloads\edital.pdf

[2] Lendo PDF: C:\Downloads\edital.pdf
    Total de paginas: 5
    Pagina 1: 37 nomes extraidos
    Pagina 2: 74 nomes extraidos
    ...

[OK] Total de nomes unicos: 187

Deseja abrir todas as pesquisas? (S/N): S

[3] Abrindo 187 pesquisas no Mind-7...
================================================================================
[1/187] OK - FERNANDA JUNIA DOS SANTOS
[2/187] OK - ANTONIO MARCOS SILVA
...
================================================================================

[OK] Concluido! 187 abas abertas
[OK] Total de abas no navegador: 188

Todas as pesquisas estao em abas separadas para revisao manual.

================================================================================
PROCESSO FINALIZADO
================================================================================

Revise as abas abertas no navegador.

Pressione ENTER para sair...
```

## 🔧 TROUBLESHOOTING

### Chrome não abre em modo debug

```cmd
# Feche todos os Chrome
taskkill /F /IM chrome.exe

# Aguarde 3 segundos

# Execute novamente
INICIAR_CHROME.bat
```

### Porta 9222 em uso

```powershell
# Verifique o que está usando
Get-NetTCPConnection -LocalPort 9222

# Mate o processo
Stop-Process -Name chrome -Force
```

### Script não conecta

```bash
# Teste manualmente
python
>>> from selenium import webdriver
>>> from selenium.webdriver.chrome.options import Options
>>> chrome_options = Options()
>>> chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
>>> driver = webdriver.Chrome(options=chrome_options)
>>> print(driver.current_url)
```

## 💡 DICAS

✅ **Mantenha a janela do BAT aberta** - Se fechar, o Chrome perde o modo debug
✅ **Não feche o Chrome** durante a automação
✅ **Faça login antes** de executar o script
✅ **Use caminho completo** do PDF para evitar erros

## 🆘 AINDA NÃO FUNCIONA?

Execute na ordem:

```bash
# 1. Diagnóstico
python diagnostico_chrome.py

# 2. Se disser que Chrome não está em debug:
INICIAR_CHROME.bat

# 3. Aguarde 5 segundos

# 4. Teste conexão
python -c "from selenium import webdriver; from selenium.webdriver.chrome.options import Options; o = Options(); o.add_experimental_option('debuggerAddress', '127.0.0.1:9222'); d = webdriver.Chrome(options=o); print('OK:', d.current_url)"

# 5. Se funcionou, execute:
python automacao_simples.py
```

---

**Versão:** 1.0 - Simples e Funcional
**Data:** 2024
**Status:** ✅ TESTADO E FUNCIONANDO
