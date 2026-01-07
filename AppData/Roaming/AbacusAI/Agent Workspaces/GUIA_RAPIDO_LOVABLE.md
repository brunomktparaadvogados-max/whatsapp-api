# 🚀 GUIA RÁPIDO - Integração WhatsApp + Lovable

## ⚠️ DESCOBERTA IMPORTANTE

**A API já tem uma interface web funcionando!**

🌐 **Acesse agora**: https://whatsapp-api-ugdv.onrender.com/

**Login:**
- Email: `admin@flow.com`
- Senha: `admin123`

**Você já pode usar o WhatsApp sem criar nada no Lovable!**

---

## 🎯 ESCOLHA SUA OPÇÃO

### OPÇÃO 1: Usar Interface Web da API (MAIS RÁPIDO) ⚡

**Pronto para usar agora!**

1. Acesse: https://whatsapp-api-ugdv.onrender.com/
2. Login: `admin@flow.com` / `admin123`
3. Clique em "Criar Nova Sessão"
4. Escaneie o QR Code com WhatsApp
5. Envie mensagens!

**Funcionalidades:**
- ✅ Criar e gerenciar sessões
- ✅ QR Code para conectar
- ✅ Enviar mensagens individuais
- ✅ Enviar mensagens em massa
- ✅ Integração com Meta API oficial
- ✅ Documentação completa

---

### OPÇÃO 2: Criar Interface Personalizada no Lovable 🎨

Se quiser criar sua própria interface customizada:

#### 1️⃣ ACESSE O LOVABLE

Vá para: **https://lovable.dev** ou **https://sistemaflow.lovable.app**

#### 2️⃣ CONFIGURE AS VARIÁVEIS

No Lovable, vá em **Settings → Environment Variables**:

```env
VITE_WHATSAPP_API_URL=https://whatsapp-api-ugdv.onrender.com
VITE_SUPABASE_URL=https://qzxywaajfmnkycrpzwmr.supabase.co
VITE_SUPABASE_ANON_KEY=seu_anon_key_aqui
```

#### 3️⃣ COLE NO CHAT DO LOVABLE

```
Preciso integrar minha API do WhatsApp. Crie:

1. src/services/whatsappApi.ts - Serviço de comunicação com autenticação JWT
2. src/components/WhatsAppLogin.tsx - Tela de login
3. src/components/WhatsAppSessions.tsx - Gerenciar sessões
4. src/components/ChatView.tsx - Enviar mensagens
5. src/components/WhatsAppNavigation.tsx - Menu principal

API: https://whatsapp-api-ugdv.onrender.com

Login padrão:
- Email: admin@flow.com
- Senha: admin123

Autenticação:
- POST /api/auth/login - Retorna token JWT
- Use token no header: Authorization: Bearer TOKEN

Endpoints:
- POST /api/sessions - Criar sessão
- GET /api/sessions/:id/qr - QR Code
- POST /api/sessions/:id/messages - Enviar mensagem
- GET /api/sessions - Listar sessões
- DELETE /api/sessions/:id - Deletar

Use shadcn/ui para interface.
```

---

## 📄 CÓDIGOS PRONTOS

Se preferir implementar manualmente, veja:
- `SOLUCAO_INTEGRACAO_LOVABLE.md` - Guia detalhado com todos os códigos
- `INTEGRACAO_WHATSAPP_COMPLETA_LOVABLE.md` - Documentação completa

**IMPORTANTE**: Adicione autenticação JWT nos códigos:

```typescript
// Exemplo de login
const login = async (email: string, password: string) => {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  localStorage.setItem('token', data.token);
  return data;
};

// Usar token nas requisições
const token = localStorage.getItem('token');
const response = await fetch(`${API_URL}/api/sessions`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## 🔗 LINKS IMPORTANTES

- **Interface Web**: https://whatsapp-api-ugdv.onrender.com/
- **Login**: admin@flow.com / admin123
- **API**: https://whatsapp-api-ugdv.onrender.com
- **Webhook**: https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook
- **Lovable**: https://lovable.dev

---

## ✅ RESULTADO

### Com Interface Web (Opção 1):
- ✅ Pronto para usar imediatamente
- ✅ Todas as funcionalidades disponíveis
- ✅ Sem necessidade de programar

### Com Lovable (Opção 2):
- ✅ Interface personalizada
- ✅ Integração com seu sistema
- ✅ Controle total do design

---

## 🆘 PROBLEMAS COMUNS

### Erro: "Token não fornecido"
**Solução**: Faça login primeiro e use o token JWT nas requisições

### Interface web não carrega
**Solução**: A API pode estar "dormindo" no Render (plano gratuito). Aguarde 30-60 segundos

### QR Code não aparece
**Solução**: Aguarde 2-3 segundos após criar a sessão

---

**🎉 RECOMENDAÇÃO: Use a Opção 1 (Interface Web) para começar imediatamente! Depois, se precisar, crie interface personalizada no Lovable.** 🚀
