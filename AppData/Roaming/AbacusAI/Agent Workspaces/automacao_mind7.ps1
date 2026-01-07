$ie = New-Object -ComObject InternetExplorer.Application
$ie.Visible = $true

Write-Host "Acessando mind-7.org..." -ForegroundColor Green

$ie.Navigate("https://mind-7.org/painel/consultas/nome_v2/")

while ($ie.Busy -eq $true) {
    Start-Sleep -Milliseconds 100
}

Start-Sleep -Seconds 3

Write-Host "Site carregado com sucesso!" -ForegroundColor Green

$nome = Read-Host "Digite o nome para pesquisar"

try {
    $doc = $ie.Document
    $campoNome = $doc.getElementById("nome")
    
    if ($campoNome) {
        $campoNome.value = $nome
        Write-Host "Nome digitado: $nome" -ForegroundColor Green
        
        $botao = $doc.getElementsByTagName("button") | Where-Object { $_.type -eq "submit" }
        if ($botao) {
            $botao[0].click()
            Write-Host "Pesquisa realizada!" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "Erro: $_" -ForegroundColor Red
}

Read-Host "Pressione Enter para fechar"
$ie.Quit()
