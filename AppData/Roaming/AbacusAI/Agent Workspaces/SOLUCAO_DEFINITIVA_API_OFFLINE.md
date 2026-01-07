# 🔧 SOLUÇÃO DEFINITIVA: API Offline no Sistema Flow

## 🎯 PROBLEMA

O sistema Flow (Lovable) mostra **"API Offline - Verifique se a API está rodando corretamente"** mesmo quando a API de automação está rodando em `http://localhost:5000`.

---

## 🔍 DIAGNÓSTICO COMPLETO

### Existem 2 APIs diferentes no seu projeto:

#### 1. **API de Automação (Python/Flask)** ← ESTE É O PROBLEMA
- **Porta:** `http://localhost:5000`
- **Arquivo:** `api_automacao.py`
- **Função:** Controla automação de processamento de editais
- **Status:** Provavelmente **NÃO está rodando** ou **Flow não consegue acessar**

#### 2. **WhatsApp API (Node.js/Express)**
- **Porta:** `https://whatsapp-api-ugdv.onrender.com`
- **Função:** Gerencia sessões WhatsApp
- **Status:** ✅ **Funcionando perfeitamente**

---

## ✅ SOLUÇÃO PASSO A PASSO

### PASSO 1: Verificar se a API de Automação está rodando

Abra um terminal PowerShell e execute:

```powershell
curl http://localhost:5000/api/health
```

**Resultado esperado:**
```json
{"mensagem":"API de automação funcionando","status":"online"}
```

**Se der erro:**
- ❌ `curl: (7) Failed to connect` → API não está rodando
- ❌ `curl: (52) Empty reply` → API travou
- ❌ Timeout → Porta bloqueada

---

### PASSO 2: Iniciar a API de Automação

Se a API não estiver rodando, inicie-a:

```powershell
# Navegar até o diretório
cd "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces"

# Iniciar a API
python api_automacao.py
```

**Saída esperada:**
```
 * Serving Flask app 'api_automacao'
 * Debug mode: on
WARNING: This is a development server. Do not use it in a production deployment.
 * Running on http://127.0.0.1:5000
Press CTRL+C to quit

Servidor rodando em: http://localhost:5000
```

**⚠️ IMPORTANTE:** Deixe este terminal aberto! Se fechar, a API para.

---

### PASSO 3: Testar a API manualmente

Em outro terminal PowerShell:

```powershell
# Teste 1: Health check
curl http://localhost:5000/api/health

# Teste 2: Status
curl http://localhost:5000/api/status
```

**Se ambos funcionarem:** A API está OK, o problema é no Flow.

---

### PASSO 4: Corrigir o problema no Flow (Lovable)

O problema mais comum é **Mixed Content** (HTTPS → HTTP).

#### Problema: Mixed Content

Se o Flow está em `https://sistemaflow.lovable.app`, ele **NÃO PODE** fazer requisições para `http://localhost:5000` por segurança do navegador.

**Verificar no console do navegador:**

1. Abra o Flow: `https://sistemaflow.lovable.app`
2. Pressione **F12** (DevTools)
3. Vá na aba **Console**
4. Procure por erros:

```
❌ Mixed Content: The page at 'https://sistemaflow.lovable.app' was loaded over HTTPS, 
   but requested an insecure XMLHttpRequest endpoint 'http://localhost:5000/api/health'
```

---

## 🛠️ SOLUÇÕES PARA MIXED CONTENT

### SOLUÇÃO A: Rodar o Flow localmente (RECOMENDADO)

Se você tem acesso ao código do Flow localmente:

```powershell
# No diretório do projeto Flow
npm run dev
# ou
yarn dev
```

Acesse em: `http://localhost:3000` (ou porta que aparecer)

**Vantagem:** HTTP → HTTP funciona perfeitamente!

---

### SOLUÇÃO B: Usar ngrok (Criar túnel HTTPS)

Transforme `http://localhost:5000` em `https://xxxxx.ngrok.io`:

#### 1. Instalar ngrok

```powershell
# Baixar de: https://ngrok.com/download
# Ou via Chocolatey:
choco install ngrok
```

#### 2. Criar túnel HTTPS

```powershell
ngrok http 5000
```

**Saída:**
```
Forwarding  https://abc123.ngrok.io -> http://localhost:5000
```

#### 3. Atualizar URL no Flow

No código do Flow (Lovable), altere:

```typescript
// ❌ ANTES
const API_URL = 'http://localhost:5000';

// ✅ DEPOIS
const API_URL = 'https://abc123.ngrok.io';
```

**⚠️ ATENÇÃO:** A URL do ngrok muda toda vez que você reinicia. Use a URL que aparecer no terminal.

---

### SOLUÇÃO C: Desabilitar Mixed Content (Temporário)

**Apenas para desenvolvimento!**

#### Chrome/Edge:

1. Instale a extensão: [Allow CORS](https://chrome.google.com/webstore/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf)
2. Ative a extensão
3. Recarregue o Flow

#### Firefox:

1. Digite na barra de endereço: `about:config`
2. Aceite o aviso
3. Procure: `security.mixed_content.block_active_content`
4. Altere para `false`

**⚠️ IMPORTANTE:** Reverta após testar!

---

## 🔧 CORRIGIR O CÓDIGO DO FLOW

Se o problema persistir, atualize o código do Flow com melhor tratamento de erros:

### Código atualizado para o Flow (Lovable)

```typescript
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const API_URL = 'http://localhost:5000'; // ou URL do ngrok

export function AutomacaoControl() {
  const [apiOnline, setApiOnline] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [erroDetalhado, setErroDetalhado] = useState('');
  const { toast } = useToast();

  // Verificar API ao carregar
  useEffect(() => {
    verificarAPI();
    const interval = setInterval(verificarAPI, 10000); // Verificar a cada 10s
    return () => clearInterval(interval);
  }, []);

  const verificarAPI = async () => {
    setVerificando(true);
    try {
      console.log('🔍 Verificando API em:', API_URL);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout 5s
      
      const response = await fetch(`${API_URL}/api/health`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log('✅ Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('✅ API Response:', data);
      
      setApiOnline(true);
      setErroDetalhado('');
      
    } catch (error: any) {
      console.error('❌ Erro ao verificar API:', error);
      
      setApiOnline(false);
      
      // Diagnóstico detalhado do erro
      if (error.name === 'AbortError') {
        setErroDetalhado('Timeout: API não respondeu em 5 segundos');
      } else if (error.message.includes('Failed to fetch')) {
        setErroDetalhado('API não está rodando ou CORS bloqueado');
      } else if (error.message.includes('NetworkError')) {
        setErroDetalhado('Erro de rede: Verifique se a API está rodando');
      } else if (error.message.includes('Mixed Content')) {
        setErroDetalhado('Erro Mixed Content: Use ngrok ou rode o Flow localmente');
      } else {
        setErroDetalhado(error.message);
      }
      
      toast({
        title: '❌ API Offline',
        description: erroDetalhado,
        variant: 'destructive'
      });
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Indicador de Status */}
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${apiOnline ? 'bg-green-500' : 'bg-red-500'} ${verificando ? 'animate-pulse' : ''}`} />
        <span className="font-medium">
          {verificando ? 'Verificando...' : apiOnline ? 'API Online' : 'API Offline'}
        </span>
      </div>

      {/* Erro Detalhado */}
      {!apiOnline && erroDetalhado && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800 font-medium">Erro:</p>
          <p className="text-sm text-red-600">{erroDetalhado}</p>
          
          <div className="mt-3 space-y-2 text-xs text-red-700">
            <p><strong>Soluções:</strong></p>
            <ul className="list-disc list-inside space-y-1">
              <li>Verifique se a API está rodando: <code className="bg-red-100 px-1 rounded">python api_automacao.py</code></li>
              <li>Teste manualmente: <code className="bg-red-100 px-1 rounded">curl http://localhost:5000/api/health</code></li>
              <li>Se estiver em HTTPS, use ngrok ou rode o Flow localmente</li>
            </ul>
          </div>
        </div>
      )}

      {/* Botão de Teste Manual */}
      <button
        onClick={verificarAPI}
        disabled={verificando}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {verificando ? 'Verificando...' : 'Testar Conexão'}
      </button>

      {/* Informações de Debug */}
      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer">Informações de Debug</summary>
        <div className="mt-2 space-y-1 bg-gray-50 p-2 rounded">
          <p><strong>URL da API:</strong> {API_URL}</p>
          <p><strong>Protocolo do Flow:</strong> {window.location.protocol}</p>
          <p><strong>Mixed Content?</strong> {window.location.protocol === 'https:' && API_URL.startsWith('http:') ? '⚠️ SIM' : '✅ NÃO'}</p>
        </div>
      </details>
    </div>
  );
}
```

---

## 📋 CHECKLIST DE VERIFICAÇÃO

Execute este checklist na ordem:

### 1. ✅ API está rodando?

```powershell
curl http://localhost:5000/api/health
```

**Esperado:** `{"mensagem":"API de automação funcionando","status":"online"}`

**Se falhar:** Execute `python api_automacao.py`

---

### 2. ✅ Porta 5000 está livre?

```powershell
netstat -ano | findstr :5000
```

**Se aparecer algo:** Outra aplicação está usando a porta 5000

**Solução:** Mate o processo ou mude a porta da API

---

### 3. ✅ CORS está configurado?

Verifique no arquivo `api_automacao.py`:

```python
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # ← Deve ter esta linha
```

**Se não tiver:** Adicione e reinicie a API

---

### 4. ✅ Flow está em HTTPS?

Abra o Flow e verifique a URL:

- ✅ `http://localhost:3000` → OK, pode acessar `http://localhost:5000`
- ❌ `https://sistemaflow.lovable.app` → Problema! Use ngrok

---

### 5. ✅ Console do navegador mostra erros?

1. Abra o Flow
2. Pressione **F12**
3. Aba **Console**
4. Procure por erros em vermelho

**Erros comuns:**

| Erro | Causa | Solução |
|------|-------|---------|
| `Failed to fetch` | API não está rodando | Execute `python api_automacao.py` |
| `Mixed Content` | HTTPS → HTTP bloqueado | Use ngrok ou rode Flow localmente |
| `CORS policy` | CORS não configurado | Adicione `CORS(app)` na API |
| `net::ERR_CONNECTION_REFUSED` | Porta errada ou API parada | Verifique porta e reinicie API |

---

## 🚀 SOLUÇÃO RÁPIDA (TL;DR)

### Se você tem pressa:

```powershell
# 1. Iniciar API
cd "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces"
python api_automacao.py

# 2. Em outro terminal, testar
curl http://localhost:5000/api/health

# 3. Se funcionar, o problema é Mixed Content
# Solução: Use ngrok
ngrok http 5000

# 4. Copie a URL HTTPS do ngrok e use no Flow
# Exemplo: https://abc123.ngrok.io
```

---

## 🎯 PROMPT PARA O LOVABLE

Se precisar pedir ajuda ao Lovable para corrigir o código:

```
A API de automação está rodando em http://localhost:5000 mas o componente mostra "API Offline".

Preciso que você:

1. Adicione verificação detalhada de conexão com a API
2. Mostre erros específicos no console (Failed to fetch, CORS, Mixed Content, etc.)
3. Adicione indicador visual de status (verde = online, vermelho = offline)
4. Adicione botão "Testar Conexão" para debug manual
5. Mostre informações de debug (URL da API, protocolo, Mixed Content)
6. Adicione timeout de 5 segundos nas requisições
7. Verifique a API a cada 10 segundos automaticamente

A API tem os seguintes endpoints:
- GET /api/health - Verifica se está online
- GET /api/status - Status da automação
- POST /api/iniciar - Inicia automação
- POST /api/parar - Para automação

Use o código que forneci acima como referência.
```

---

## 🔧 MANTER A API RODANDO

### Opção 1: Terminal dedicado

Deixe um terminal PowerShell aberto com a API rodando.

### Opção 2: Rodar em background (Windows)

Crie um arquivo `iniciar_api_background.bat`:

```batch
@echo off
start /B python api_automacao.py
echo API iniciada em background
```

Execute: `iniciar_api_background.bat`

### Opção 3: Criar serviço Windows (Avançado)

Use **NSSM** (Non-Sucking Service Manager):

```powershell
# Instalar NSSM
choco install nssm

# Criar serviço
nssm install AutomacaoAPI "C:\Python\python.exe" "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces\api_automacao.py"

# Iniciar serviço
nssm start AutomacaoAPI
```

---

## 📞 PRÓXIMOS PASSOS

1. **Execute o checklist acima** na ordem
2. **Anote onde falhou** (qual passo deu erro)
3. **Copie os erros do console** (F12 → Console)
4. **Me informe** para ajudar com solução específica

---

## 🆘 AINDA NÃO FUNCIONOU?

Se seguiu todos os passos e ainda não funciona:

### Informações necessárias para debug:

1. **Saída do comando:**
   ```powershell
   curl http://localhost:5000/api/health
   ```

2. **URL do Flow:**
   - Está em `http://localhost:3000`?
   - Ou em `https://sistemaflow.lovable.app`?

3. **Erros do console do navegador:**
   - Pressione F12
   - Aba Console
   - Copie todos os erros em vermelho

4. **Saída do terminal da API:**
   - O que aparece quando executa `python api_automacao.py`?

5. **Teste de porta:**
   ```powershell
   netstat -ano | findstr :5000
   ```

Com essas informações, posso dar uma solução específica para o seu caso.

---

**Desenvolvido para integração Sistema Flow + API de Automação Python**
