# ====================================================================
#              GUIA RAPIDO - COMANDOS POWERSHELL
# ====================================================================

# OPCAO 1: USAR O SCRIPT PRONTO (RECOMENDADO)
# ====================================================================

# Execute este comando:
.\iniciar_chrome.ps1

# Se der erro de execucao, execute antes:
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force


# OPCAO 2: COMANDOS MANUAIS (COPIE E COLE)
# ====================================================================

# 1. Fechar Chrome
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue

# 2. Aguardar
Start-Sleep -Seconds 3

# 3. Iniciar Chrome em modo debug
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\Google\Chrome\User Data\Debug"

# 4. Aguardar Chrome abrir
Start-Sleep -Seconds 3

# 5. Abrir Mind-7
Start-Process "https://mind-7.org"


# OPCAO 3: TUDO EM UM COMANDO (COPIE TUDO)
# ====================================================================

Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3; & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\Google\Chrome\User Data\Debug"; Start-Sleep -Seconds 3; Start-Process "https://mind-7.org"; Write-Host "`n[OK] Chrome iniciado em modo debug!" -ForegroundColor Green; Write-Host "[!] Faca login no Mind-7 e execute: python automacao_simples.py`n" -ForegroundColor Yellow


# VERIFICAR SE FUNCIONOU
# ====================================================================

# Verificar se Chrome esta rodando
Get-Process chrome

# Verificar se porta 9222 esta aberta
Test-NetConnection -ComputerName localhost -Port 9222

# Testar conexao (deve abrir pagina JSON)
Start-Process "http://localhost:9222/json"


# EXECUTAR AUTOMACAO
# ====================================================================

# Depois de fazer login no Mind-7, execute:
python automacao_simples.py


# SOLUCAO DE PROBLEMAS
# ====================================================================

# Se der erro "ExecutionPolicy":
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Se Chrome nao fechar:
Get-Process chrome | Stop-Process -Force

# Se porta 9222 estiver em uso:
Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue | Select-Object OwningProcess | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Verificar versao do Chrome:
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --version


# DIAGNOSTICO COMPLETO
# ====================================================================

# Execute para diagnosticar problemas:
python diagnostico_chrome.py


# ====================================================================
#                    RESUMO - 3 COMANDOS
# ====================================================================

# 1. Fechar Chrome
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue

# 2. Iniciar em modo debug
.\iniciar_chrome.ps1

# 3. Executar automacao (apos fazer login)
python automacao_simples.py


# ====================================================================
