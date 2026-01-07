# Script para iniciar a API de automação
Write-Host "=" * 60
Write-Host "INICIANDO API DE AUTOMAÇÃO"
Write-Host "=" * 60

# Verificar se Python está instalado
try {
    $pythonVersion = python --version
    Write-Host "`nPython encontrado: $pythonVersion"
} catch {
    Write-Host "`nERRO: Python não encontrado!"
    Write-Host "Instale Python em: https://www.python.org/downloads/"
    pause
    exit
}

# Verificar se as dependências estão instaladas
Write-Host "`nVerificando dependências..."
pip install -r requirements.txt

# Iniciar a API
Write-Host "`nIniciando servidor API..."
Write-Host "A API estará disponível em: http://localhost:5000"
Write-Host "`nPressione Ctrl+C para parar o servidor"
Write-Host "=" * 60

python api_automacao.py
