# Automação Completa - Edital → Mind7 → Flow

## 🚀 Funcionalidades

✅ Extrai dados do PDF do edital (local)
✅ Pesquisa no Mind7 pelo nome
✅ Clica no CPF e extrai dados completos
✅ Filtra apenas telefones com 9 e ícone WhatsApp
✅ Valida se o número está ativo no WhatsApp
✅ Captura screenshot em alta resolução do Mind7
✅ Adiciona no Flow: nome, telefone, processo, print e texto do edital
✅ **Usa suas abas já logadas** (Mind7 e Flow)
✅ **Controle de pausa/continuar durante processamento**

## 📋 Pré-requisitos

```bash
pip install selenium webdriver-manager pandas PyPDF2 Pillow requests
```

## 🎯 Como Usar

### Opção 1: Usar Navegador Existente (Recomendado)

1. **Abra o Chrome com debugging:**
   - Execute: `abrir_chrome_debug.bat`
   - OU manualmente: `chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\selenium\chrome_profile"`

2. **Faça login nas plataformas:**
   - Abra uma aba e faça login no Mind7
   - Abra outra aba e faça login no Flow

3. **Execute a automação:**
   ```bash
   python automacao_edital_completa.py
   ```

4. **Escolha modo 1** (conectar ao navegador existente)

### Opção 2: Novo Navegador

1. Execute: `python automacao_edital_completa.py`
2. Escolha modo 2
3. Aguarde 30s para resolver Cloudflare
4. Faça login manualmente quando solicitado

## ⏯️ Controles Durante Processamento

Durante a execução, você pode:

- **P** = Pausar/Continuar o processamento
- **S** = Parar completamente

Digite o comando e pressione ENTER.

## 📁 Estrutura de Arquivos Gerados

- `mind7_NOME_TIMESTAMP.png` - Screenshots do Mind7
- `edital_extraido_TIMESTAMP.csv` - Dados estruturados
- `edital_texto_completo_TIMESTAMP.txt` - Texto completo do edital

## 🔧 Configurações

- **Limite de contatos:** 2 por execução (editável na linha 402)
- **Validação WhatsApp:** API gratuita do WhatsApp Web
- **Screenshots:** Alta resolução, página completa

## ⚠️ Observações

- O navegador em modo debug deve permanecer aberto durante a automação
- Certifique-se de estar logado no Mind7 e Flow antes de iniciar
- A validação de WhatsApp pode levar alguns segundos por número
- Use P para pausar se precisar intervir manualmente
