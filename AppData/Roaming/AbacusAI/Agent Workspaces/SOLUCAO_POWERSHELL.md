# ====================================================================
#                  SOLUCAO RAPIDA - POWERSHELL
# ====================================================================

## PROBLEMA: taskkill nao funciona no PowerShell

## SOLUCAO: Use comandos PowerShell nativos


# ====================================================================
#                    METODO 1: SCRIPT PRONTO
# ====================================================================

# Abra o PowerShell e execute:

.\iniciar_chrome.ps1

# Se der erro, execute antes:
Set-ExecutionPolicy -Bypass -Scope Process -Force


# ====================================================================
#                METODO 2: COMANDO UNICO (COPIE TUDO)
# ====================================================================

Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3; Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=`"$env:LOCALAPPDATA\Google\Chrome\User Data\Debug`""; Start-Sleep -Seconds 3; Start-Process "https://mind-7.org"


# ====================================================================
#                  METODO 3: PASSO A PASSO
# ====================================================================

# Passo 1: Fechar Chrome
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue

# Passo 2: Aguardar
Start-Sleep -Seconds 3

# Passo 3: Iniciar Chrome em modo debug
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=`"$env:LOCALAPPDATA\Google\Chrome\User Data\Debug`""

# Passo 4: Aguardar
Start-Sleep -Seconds 3

# Passo 5: Abrir Mind-7
Start-Process "https://mind-7.org"


# ====================================================================
#                      VERIFICAR SE FUNCIONOU
# ====================================================================

# Verificar Chrome rodando:
Get-Process chrome

# Testar porta 9222:
Start-Process "http://localhost:9222/json"

# Se abrir uma pagina JSON = FUNCIONOU!


# ====================================================================
#                    EXECUTAR AUTOMACAO
# ====================================================================

# Depois de fazer login no Mind-7:
python automacao_simples.py


# ====================================================================
#                    TABELA DE COMANDOS
# ====================================================================

# CMD (nao funciona no PowerShell)  |  PowerShell (use este)
# ----------------------------------|---------------------------
# taskkill /F /IM chrome.exe        |  Stop-Process -Name chrome -Force
# timeout /t 3                      |  Start-Sleep -Seconds 3
# start chrome.exe                  |  Start-Process "chrome.exe"
# cls                               |  Clear-Host
# echo texto                        |  Write-Host "texto"


# ====================================================================
#                    SOLUCAO DE ERROS
# ====================================================================

# ERRO: "nao pode ser carregado porque a execucao de scripts foi desabilitada"
# SOLUCAO:
Set-ExecutionPolicy -Bypass -Scope Process -Force

# ERRO: "Chrome nao encontrado"
# SOLUCAO: Ajuste o caminho
Start-Process "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222"

# ERRO: "Porta 9222 em uso"
# SOLUCAO:
Get-Process chrome | Stop-Process -Force
Start-Sleep -Seconds 5


# ====================================================================
#                    ATALHO RAPIDO
# ====================================================================

# Salve este comando em um arquivo .ps1 e execute:

# fechar_e_iniciar_chrome.ps1
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=`"$env:LOCALAPPDATA\Google\Chrome\User Data\Debug`""
Start-Sleep -Seconds 3
Start-Process "https://mind-7.org"
Write-Host "`n[OK] Chrome iniciado! Faca login e execute: python automacao_simples.py`n" -ForegroundColor Green


# ====================================================================
