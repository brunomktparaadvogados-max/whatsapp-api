# 🚀 GUIA RÁPIDO - Integração WhatsApp + Lovable

## ✅ PROBLEMA RESOLVIDO

A API do WhatsApp estava parada. Agora está **RODANDO** em `http://localhost:3000`

## 📋 PASSO A PASSO PARA INTEGRAR

### 1️⃣ Manter API Rodando

Execute um dos scripts:

**Windows (Batch):**
```batch
INICIAR_API_WHATSAPP.bat
```

**Windows (PowerShell):**
```powershell
.\INICIAR_API_WHATSAPP.ps1
```

**Ou manualmente:**
```bash
cd whatsapp-api
npm start
```

### 2️⃣ Configurar Lovable

No seu projeto Lovable, adicione no arquivo `.env`:

```env
VITE_WHATSAPP_API_URL=http://localhost:3000
```

### 3️⃣ Implementar no Lovable

Cole este prompt no chat do Lovable:

```
Preciso integrar a API do WhatsApp que está rodando em http://localhost:3000

Crie os seguintes componentes:

1. Um serviço em src/services/whatsappApi.ts que conecte com a API
2. Uma página de login para autenticar na API (credenciais: admin@flow.com / admin123)
3. Uma página para gerenciar sessões do WhatsApp (criar, listar, deletar)
4. Uma página para enviar mensagens

Use a documentação em whatsapp-api/LOVABLE_INTEGRATION.md como referência.

A API já está rodando e aceita CORS de qualquer origem.
```

### 4️⃣ Testar Conexão

No console do navegador (F12), execute:

```javascript
fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@flow.com',
    password: 'admin123'
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Conectado!', data);
  localStorage.setItem('whatsapp_token', data.token);
})
.catch(err => console.error('❌ Erro:', err));
```

### 5️⃣ Criar Sessão WhatsApp

Após fazer login no Lovable:

1. Vá para a página de sessões
2. Clique em "Nova Sessão"
3. Escaneie o QR Code com seu WhatsApp
4. Aguarde a conexão

### 6️⃣ Enviar Mensagem de Teste

```javascript
const token = localStorage.getItem('whatsapp_token');

fetch('http://localhost:3000/api/sessions/default/messages', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: '5511999999999', // Número com DDI
    message: 'Teste de integração!'
  })
})
.then(r => r.json())
.then(data => console.log('✅ Mensagem enviada!', data))
.catch(err => console.error('❌ Erro:', err));
```

## 📚 DOCUMENTAÇÃO COMPLETA

- `DIAGNOSTICO_API_WHATSAPP.md` - Diagnóstico completo e troubleshooting
- `whatsapp-api/LOVABLE_INTEGRATION.md` - Código completo para integração
- `whatsapp-api/README.md` - Documentação da API
- `whatsapp-api/QUICKSTART.md` - Guia de início rápido

## 🔧 COMANDOS ÚTEIS

### Verificar se API está rodando
```powershell
netstat -ano | findstr :3000
```

### Testar API
```powershell
curl http://localhost:3000
```

### Ver logs da API
Os logs aparecem no terminal onde você executou `npm start`

### Parar API
Pressione `Ctrl+C` no terminal da API

## ⚠️ IMPORTANTE

- **Mantenha a API rodando** enquanto usa o Lovable
- Use sempre `http://localhost:3000` (não `127.0.0.1`)
- O token de autenticação expira após 24h
- Cada sessão WhatsApp precisa de um QR Code único

## 🎯 CHECKLIST

- [x] API rodando na porta 3000
- [ ] Variável VITE_WHATSAPP_API_URL configurada no Lovable
- [ ] Serviço WhatsApp implementado no Lovable
- [ ] Login realizado com sucesso
- [ ] Sessão WhatsApp criada
- [ ] QR Code escaneado
- [ ] Mensagem de teste enviada

## 🆘 PROBLEMAS?

1. **API não inicia**: Verifique se Node.js está instalado (`node --version`)
2. **Porta em uso**: Execute o script de inicialização que mata o processo automaticamente
3. **Erro de CORS**: Limpe o cache do navegador e tente novamente
4. **Token inválido**: Faça login novamente

## 📞 ENDPOINTS PRINCIPAIS

- `POST /api/auth/login` - Login
- `GET /api/sessions` - Listar sessões
- `POST /api/sessions` - Criar sessão
- `GET /api/sessions/:id/qr` - Obter QR Code
- `POST /api/sessions/:id/messages` - Enviar mensagem

---

**Tudo pronto!** A API está funcionando. Agora é só integrar no Lovable! 🚀
