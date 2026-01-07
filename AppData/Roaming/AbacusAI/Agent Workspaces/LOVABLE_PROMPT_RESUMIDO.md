# 🚀 INSTRUÇÕES RÁPIDAS PARA LOVABLE - INTEGRAÇÃO WHATSAPP

## 📋 COPIE E COLE ESTE PROMPT NO LOVABLE:

---

Preciso integrar minha aplicação com uma API WhatsApp já configurada. Siga estas instruções:

**API Base URL:** `https://whatsapp-api-ugdv.onrender.com`

**Credenciais:**
- Email: `admin@flow.com`
- Senha: `admin123`

**Sessão Padrão:** `WhatsApp`

---

## 🎯 O QUE PRECISO:

1. **Criar serviço de API** (`src/services/whatsappApi.ts`) com:
   - Método de login que retorna token JWT
   - Métodos para: listar sessões, obter QR Code, enviar mensagens, enviar mídia
   - Armazenar token no localStorage
   - URL base: `https://whatsapp-api-ugdv.onrender.com`

2. **Criar hook customizado** (`src/hooks/useWhatsApp.ts`) com:
   - Estado para: autenticação, sessões, QR Code, loading, erro
   - Funções: login, loadSessions, loadQRCode, sendMessage

3. **Componente WhatsAppQRCode** (`src/components/WhatsAppQRCode.tsx`):
   - Exibir QR Code em um Card
   - Timer de 60 segundos com countdown
   - Botão para regenerar QR Code quando expirar
   - Instruções de como escanear
   - Loading state e tratamento de erros

4. **Componente SendMessage** (`src/components/SendMessage.tsx`):
   - Input para número de telefone (formato: 5511999999999)
   - Textarea para mensagem
   - Botão de enviar com loading state
   - Toast de sucesso/erro

5. **Página principal** que:
   - Faz login automático ao carregar
   - Verifica se sessão "WhatsApp" está conectada
   - Se NÃO conectada: mostra componente WhatsAppQRCode
   - Se conectada: mostra componente SendMessage

---

## 📡 ENDPOINTS DA API:

### Login
```
POST /api/auth/login
Body: { "email": "admin@flow.com", "password": "admin123" }
Retorna: { "success": true, "token": "...", "user": {...} }
```

### Listar Sessões
```
GET /api/sessions
Header: Authorization: Bearer {token}
Retorna: [{ "id": "WhatsApp", "status": "connected", "info": {...} }]
```

### Obter QR Code
```
GET /api/sessions/WhatsApp/qr
Header: Authorization: Bearer {token}
Retorna: { "success": true, "qrCode": "data:image/png;base64,...", "status": "qr_code" }
```

### Enviar Mensagem
```
POST /api/sessions/WhatsApp/message
Header: Authorization: Bearer {token}
Body: { "to": "5511999999999", "message": "Olá!" }
Retorna: { "success": true, "messageId": "...", "timestamp": ... }
```

---

## ⚙️ REQUISITOS TÉCNICOS:

- Use TypeScript
- Use shadcn/ui para componentes (Card, Button, Input, Textarea)
- Use lucide-react para ícones (Loader2)
- Implemente tratamento de erros com try/catch
- Use toast para feedback ao usuário
- Armazene token JWT no localStorage
- Formato de número: apenas dígitos com código do país (ex: 5511999999999)

---

## 🎨 FLUXO DA APLICAÇÃO:

1. Usuário acessa a página
2. Sistema faz login automático
3. Sistema verifica status da sessão "WhatsApp"
4. **Se não conectada:**
   - Mostra QR Code
   - Timer de 60 segundos
   - Instruções para escanear
5. **Se conectada:**
   - Mostra formulário de envio
   - Permite enviar mensagens

---

## ✅ VALIDAÇÕES:

- Verificar se token existe antes de cada requisição
- Validar formato do número de telefone
- Mostrar loading durante requisições
- Exibir mensagens de erro claras
- Permitir regenerar QR Code quando expirar

---

**IMPORTANTE:** A API já está online e funcionando. Use exatamente a URL `https://whatsapp-api-ugdv.onrender.com` e as credenciais fornecidas.

---

## 📝 ESTRUTURA DE ARQUIVOS ESPERADA:

```
src/
├── services/
│   └── whatsappApi.ts
├── hooks/
│   └── useWhatsApp.ts
├── components/
│   ├── WhatsAppQRCode.tsx
│   └── SendMessage.tsx
└── pages/
    └── WhatsAppPage.tsx (ou index.tsx)
```

---

**Crie todos os arquivos necessários e implemente a integração completa seguindo estas especificações.**
