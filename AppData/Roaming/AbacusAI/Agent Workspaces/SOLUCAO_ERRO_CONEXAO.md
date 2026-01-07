# SOLUÇÃO RÁPIDA - ERRO DE CONEXÃO COM CHROME

## Erro Atual
```
Message: session not created: cannot connect to chrome at 127.0.0.1:9222
from chrome not reachable
```

## Causa
O Chrome não está rodando em modo debug na porta 9222.

## SOLUÇÃO RÁPIDA - 3 PASSOS

### Passo 1: Feche TODOS os Chrome abertos
```powershell
# No PowerShell (como Administrador):
Stop-Process -Name chrome -Force
```

Ou simplesmente feche todas as janelas do Chrome manualmente.

### Passo 2: Inicie o Chrome em modo debug

**OPÇÃO A - Usar o novo script (RECOMENDADO):**
```bash
# Clique duas vezes em:
iniciar_chrome_debug_novo.bat
```

**OPÇÃO B - Manualmente no PowerShell:**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\Google\Chrome\User Data\Debug"
```

**OPÇÃO C - Manualmente no CMD:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data\Debug"
```

### Passo 3: Verifique se funcionou

**Teste 1 - Abra no navegador:**
```
http://localhost:9222/json
```
Deve mostrar uma lista JSON com as abas abertas.

**Teste 2 - Execute o teste:**
```bash
python teste_conexao_deteccao.py
```

## VERIFICAÇÕES SE NÃO FUNCIONAR

### 1. Verificar se Chrome está instalado
```powershell
Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe"
```
Deve retornar `True`

### 2. Verificar se a porta 9222 está livre
```powershell
Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue
```
Se retornar algo, a porta está em uso. Feche o Chrome e tente novamente.

### 3. Verificar processos do Chrome
```powershell
Get-Process chrome
```
Se aparecer processos, feche todos:
```powershell
Stop-Process -Name chrome -Force
```

### 4. Verificar Firewall
O firewall pode estar bloqueando a porta 9222. Adicione exceção:
```powershell
# Como Administrador:
New-NetFirewallRule -DisplayName "Chrome Debug" -Direction Inbound -LocalPort 9222 -Protocol TCP -Action Allow
```

## SCRIPTS DISPONÍVEIS

### 1. `iniciar_chrome_debug_novo.bat` (NOVO - RECOMENDADO)
- Fecha Chrome automaticamente
- Verifica porta 9222
- Inicia Chrome em modo debug
- Abre Mind-7 automaticamente
- Monitora o processo
- Mostra status em tempo real

### 2. `iniciar_chrome_debug.bat` (ANTIGO)
- Versão simples
- Menos verificações

### 3. `teste_conexao_deteccao.py`
- Testa conexão com Chrome
- Verifica detecção de resultados
- Útil para diagnóstico

## PASSO A PASSO COMPLETO

1. **Feche todos os Chrome:**
   - Feche todas as janelas
   - Ou execute: `taskkill /F /IM chrome.exe`

2. **Execute o script novo:**
   ```
   iniciar_chrome_debug_novo.bat
   ```

3. **Aguarde as mensagens:**
   ```
   [1/5] Verificando processos do Chrome...
   [2/5] Verificando porta 9222...
   [3/5] Localizando Chrome...
   [4/5] Preparando diretorio de dados...
   [5/5] Iniciando Chrome em modo debug...
   [OK] Chrome iniciado com sucesso!
   [OK] Porta 9222 esta escutando!
   ```

4. **Faça login no Mind-7:**
   - O script abrirá automaticamente https://mind-7.org
   - Faça login normalmente

5. **Execute a automação:**
   ```bash
   python automacao_completa_duas_fases.py
   ```

6. **IMPORTANTE:**
   - NÃO feche a janela do script BAT
   - NÃO feche o Chrome durante a automação
   - Mantenha o login ativo no Mind-7

## ERROS COMUNS

### Erro: "Chrome não encontrado"
**Solução:** Instale o Google Chrome ou ajuste o caminho no script.

### Erro: "Porta 9222 em uso"
**Solução:** 
```powershell
Stop-Process -Name chrome -Force
Start-Sleep -Seconds 3
# Tente novamente
```

### Erro: "Access Denied"
**Solução:** Execute o PowerShell como Administrador.

### Erro: "Script não pode ser executado"
**Solução:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

## TESTE RÁPIDO

Depois de iniciar o Chrome em modo debug, teste:

```bash
# Teste 1: Verificar porta
curl http://localhost:9222/json

# Teste 2: Executar teste Python
python teste_conexao_deteccao.py
```

## SUPORTE

Se ainda não funcionar:

1. Copie a saída completa do erro
2. Execute: `Get-Process chrome | Format-List *`
3. Execute: `Get-NetTCPConnection -LocalPort 9222`
4. Verifique versão do Chrome: `chrome://version`
5. Verifique versão do ChromeDriver

## ALTERNATIVA - Usar Brave ou Edge

Se o Chrome não funcionar, você pode usar Brave ou Edge:

**Brave:**
```cmd
"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222
```

**Edge:**
```cmd
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222
```
