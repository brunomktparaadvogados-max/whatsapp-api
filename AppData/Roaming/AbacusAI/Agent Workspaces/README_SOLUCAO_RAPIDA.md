# 🔧 SOLUÇÃO - Erro de Conexão com Chrome

## ❌ Erro que você está tendo:
```
Message: session not created: cannot connect to chrome at 127.0.0.1:9222
from chrome not reachable
```

## ✅ SOLUÇÃO RÁPIDA (3 passos)

### 1️⃣ Execute o diagnóstico
```bash
python diagnostico_chrome.py
```

Este script vai verificar tudo e te dizer exatamente o que está errado.

### 2️⃣ Inicie o Chrome em modo debug

**Clique duas vezes em:**
```
iniciar_chrome_debug_novo.bat
```

**OU execute no PowerShell:**
```powershell
.\iniciar_chrome_debug_melhorado.ps1
```

### 3️⃣ Teste a conexão
```bash
python teste_conexao_deteccao.py
```

Se funcionar, execute a automação:
```bash
python automacao_completa_duas_fases.py
```

---

## 📋 CHECKLIST - Faça nesta ordem

- [ ] **Feche TODOS os Chrome abertos**
  ```cmd
  taskkill /F /IM chrome.exe
  ```

- [ ] **Execute o diagnóstico**
  ```bash
  python diagnostico_chrome.py
  ```

- [ ] **Inicie Chrome em modo debug**
  ```
  iniciar_chrome_debug_novo.bat
  ```

- [ ] **Aguarde as mensagens de sucesso:**
  - ✅ Chrome iniciado com sucesso!
  - ✅ Porta 9222 esta escutando!

- [ ] **Acesse e faça login:**
  - Abra: https://mind-7.org
  - Faça login normalmente

- [ ] **Teste a conexão:**
  ```bash
  python teste_conexao_deteccao.py
  ```

- [ ] **Execute a automação:**
  ```bash
  python automacao_completa_duas_fases.py
  ```

---

## 🛠️ SCRIPTS DISPONÍVEIS

### 1. `diagnostico_chrome.py` ⭐ COMECE AQUI
**O que faz:**
- Verifica se Chrome está instalado
- Verifica se há processos rodando
- Testa porta 9222
- Testa conexão Selenium
- Gera relatório completo

**Como usar:**
```bash
python diagnostico_chrome.py
```

### 2. `iniciar_chrome_debug_novo.bat` ⭐ USE ESTE
**O que faz:**
- Fecha Chrome automaticamente
- Verifica porta 9222
- Inicia Chrome em modo debug
- Abre Mind-7 automaticamente
- Monitora o processo

**Como usar:**
```
Clique duas vezes no arquivo
```

### 3. `teste_conexao_deteccao.py`
**O que faz:**
- Testa conexão com Chrome
- Testa detecção de resultados
- Útil para diagnóstico

**Como usar:**
```bash
python teste_conexao_deteccao.py
```

### 4. `automacao_completa_duas_fases.py`
**O que faz:**
- Automação principal
- Processa PDF do edital
- Pesquisa no Mind-7
- Abre CPFs automaticamente

**Como usar:**
```bash
python automacao_completa_duas_fases.py
```

---

## 🔍 VERIFICAÇÕES MANUAIS

### Teste 1: Porta 9222 está aberta?
Abra no navegador:
```
http://localhost:9222/json
```
**Deve mostrar:** Lista JSON com abas abertas

### Teste 2: Chrome está rodando?
```powershell
Get-Process chrome
```
**Deve mostrar:** Processos do Chrome

### Teste 3: Porta está escutando?
```powershell
Get-NetTCPConnection -LocalPort 9222
```
**Deve mostrar:** Conexão na porta 9222

---

## ⚠️ PROBLEMAS COMUNS

### Problema 1: "Chrome não encontrado"
**Solução:**
1. Instale o Google Chrome
2. Ou ajuste o caminho no script

### Problema 2: "Porta 9222 em uso"
**Solução:**
```powershell
Stop-Process -Name chrome -Force
```
Aguarde 3 segundos e tente novamente

### Problema 3: "Access Denied"
**Solução:**
Execute o PowerShell como Administrador

### Problema 4: "Script não pode ser executado"
**Solução:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

### Problema 5: Chrome abre mas não conecta
**Solução:**
1. Feche o Chrome
2. Aguarde 5 segundos
3. Execute o script novamente
4. Verifique firewall

---

## 📝 ORDEM DE EXECUÇÃO

```
1. diagnostico_chrome.py          ← Verifica tudo
2. iniciar_chrome_debug_novo.bat  ← Inicia Chrome
3. [Faça login no Mind-7]         ← Manual
4. teste_conexao_deteccao.py      ← Testa conexão
5. automacao_completa_duas_fases.py ← Automação
```

---

## 🎯 DICAS IMPORTANTES

✅ **FAÇA:**
- Feche todos os Chrome antes de iniciar
- Mantenha a janela do BAT aberta
- Faça login no Mind-7 antes de rodar automação
- Use o script novo (`iniciar_chrome_debug_novo.bat`)

❌ **NÃO FAÇA:**
- Não feche o Chrome durante automação
- Não feche a janela do script BAT
- Não navegue manualmente durante automação
- Não use Chrome normal e debug ao mesmo tempo

---

## 📞 AINDA NÃO FUNCIONA?

Execute e copie a saída:

```bash
# 1. Diagnóstico completo
python diagnostico_chrome.py

# 2. Verificar processos
tasklist | findstr chrome

# 3. Verificar porta
netstat -ano | findstr 9222

# 4. Versão do Chrome
"C:\Program Files\Google\Chrome\Application\chrome.exe" --version
```

---

## 🚀 INÍCIO RÁPIDO

**Para quem tem pressa:**

```bash
# 1. Feche Chrome
taskkill /F /IM chrome.exe

# 2. Inicie debug
iniciar_chrome_debug_novo.bat

# 3. Aguarde mensagem de sucesso

# 4. Faça login no Mind-7

# 5. Execute automação
python automacao_completa_duas_fases.py
```

---

## 📚 DOCUMENTAÇÃO ADICIONAL

- `SOLUCAO_ERRO_CONEXAO.md` - Guia detalhado de solução
- `CORRECOES_ERRO_SESSAO.md` - Correções aplicadas no código
- `DOCUMENTACAO_SISTEMA_EDITAL.md` - Documentação completa do sistema

---

## ✨ NOVIDADES NESTA VERSÃO

✅ Script de diagnóstico automático
✅ Inicialização melhorada do Chrome
✅ Detecção de erros de sessão
✅ Mensagens de erro mais claras
✅ Recuperação automática de erros
✅ Monitoramento em tempo real
✅ Abertura automática do Mind-7

---

**Última atualização:** 2024
**Versão:** 2.0 - Corrigida
