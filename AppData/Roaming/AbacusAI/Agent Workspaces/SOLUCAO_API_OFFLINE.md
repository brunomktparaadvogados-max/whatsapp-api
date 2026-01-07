# 🔧 SOLUÇÃO: API Offline no Flow

## ✅ Status Atual

A API está **RODANDO** e **FUNCIONANDO** corretamente em `http://localhost:5000`

**Teste realizado:**
```bash
curl http://localhost:5000/api/health
# Resposta: {"mensagem":"API de automação funcionando","status":"online"}
```

## 🎯 Problema

O Flow (Lovable) está mostrando "API de automação não está rodando" mesmo com a API online.

## 🔍 Possíveis Causas

### 1. **Protocolo HTTPS vs HTTP**
   - Se o Flow está em HTTPS (sistemaflow.lovable.app), ele pode bloquear requisições HTTP
   - Navegadores modernos bloqueiam "Mixed Content" (HTTPS → HTTP)

### 2. **URL incorreta no código do Flow**
   - Verificar se está usando `http://localhost:5000` (correto)
   - Não usar `https://localhost:5000` (incorreto)

### 3. **CORS não configurado corretamente**
   - ✅ JÁ CORRIGIDO: Atualizei a API com CORS completo

## 🛠️ Soluções

### Solução 1: Testar com a página HTML local (RECOMENDADO)

1. Abra o arquivo `teste_api.html` que acabou de abrir no navegador
2. Verifique se mostra "✅ Status da API: ONLINE"
3. Se funcionar aqui, o problema é no Flow

### Solução 2: Verificar o código do Flow

No código do Flow (Lovable), certifique-se de que está usando:

```typescript
// ✅ CORRETO
const API_URL = 'http://localhost:5000';

// ❌ ERRADO
const API_URL = 'https://localhost:5000';
```

### Solução 3: Adicionar tratamento de erro detalhado no Flow

Substitua o código de verificação da API no Flow por:

```typescript
async function verificarAPI() {
  try {
    console.log('Tentando conectar em: http://localhost:5000/api/health');
    
    const response = await fetch('http://localhost:5000/api/health', {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('API Response:', data);
    
    // API está online
    setApiOnline(true);
    
  } catch (error) {
    console.error('Erro detalhado:', error);
    console.error('Tipo do erro:', error.name);
    console.error('Mensagem:', error.message);
    
    // API está offline
    setApiOnline(false);
  }
}
```

### Solução 4: Problema de Mixed Content (HTTPS → HTTP)

Se o Flow está em HTTPS, você tem 3 opções:

**Opção A: Usar extensão de navegador**
- Instale "Allow CORS" ou similar
- Ative apenas para desenvolvimento

**Opção B: Abrir o Flow em HTTP local**
- Se possível, rode o Flow localmente em `http://localhost:3000`

**Opção C: Criar túnel HTTPS (avançado)**
```powershell
# Instalar ngrok
# Criar túnel HTTPS para a API local
ngrok http 5000
# Usar a URL HTTPS fornecida pelo ngrok no Flow
```

### Solução 5: Verificar console do navegador

1. Abra o Flow no navegador
2. Pressione F12 para abrir DevTools
3. Vá na aba "Console"
4. Procure por erros relacionados a:
   - CORS
   - Mixed Content
   - Network Error
   - Failed to fetch

**Erros comuns e soluções:**

```
❌ "Mixed Content: The page was loaded over HTTPS, but requested an insecure XMLHttpRequest"
✅ Solução: Use ngrok ou rode o Flow em HTTP local

❌ "Failed to fetch"
✅ Solução: Verifique se a API está rodando (curl http://localhost:5000/api/health)

❌ "CORS policy: No 'Access-Control-Allow-Origin' header"
✅ Solução: Já corrigido na API, reinicie a API

❌ "net::ERR_CONNECTION_REFUSED"
✅ Solução: API não está rodando, execute: python api_automacao.py
```

## 🧪 Teste Rápido

Execute estes comandos para verificar:

```powershell
# 1. Verificar se a API está rodando
curl http://localhost:5000/api/health

# 2. Verificar status
curl http://localhost:5000/api/status

# 3. Abrir página de teste
start teste_api.html
```

## 📝 Prompt para o Lovable (se necessário)

Se o problema persistir, use este prompt no Lovable:

```
A API de automação está rodando em http://localhost:5000 mas o componente continua mostrando "API Offline".

Preciso que você:

1. Adicione logs detalhados no console para debug:
   - URL sendo acessada
   - Status da resposta
   - Erro completo (se houver)

2. Verifique se está usando HTTP (não HTTPS) para localhost:
   const API_URL = 'http://localhost:5000';

3. Adicione tratamento para erro de Mixed Content:
   - Se o site está em HTTPS, mostrar aviso específico
   - Sugerir usar ngrok ou rodar localmente

4. Teste a conexão ao carregar o componente:
   useEffect(() => {
     verificarAPI();
   }, []);

5. Adicione botão "Testar Conexão" para debug manual

Por favor, implemente essas melhorias no componente de Automação de Edital.
```

## 🎯 Checklist de Verificação

- [ ] API está rodando? `curl http://localhost:5000/api/health`
- [ ] teste_api.html mostra API online?
- [ ] Console do navegador mostra algum erro?
- [ ] Flow está em HTTPS ou HTTP?
- [ ] URL no código do Flow está correta (http://localhost:5000)?
- [ ] CORS está configurado na API? (✅ Sim, já configurado)

## 📞 Próximos Passos

1. **Abra o teste_api.html** que acabou de abrir no navegador
2. **Verifique se mostra "API ONLINE"**
3. **Se sim:** O problema está no código do Flow
4. **Se não:** Verifique o console do navegador (F12)
5. **Copie os erros** e me informe para ajudar

---

**API está rodando no terminal 4 (background)**
**Não feche o terminal enquanto usar a automação!**
