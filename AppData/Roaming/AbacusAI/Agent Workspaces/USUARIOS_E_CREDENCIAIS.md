# 👤 USUÁRIOS E CREDENCIAIS - API WHATSAPP

## 🔐 CREDENCIAIS PADRÃO

### Usuário Administrador
```
Email: admin@flow.com
Senha: admin123
```

**⚠️ IMPORTANTE:** Este é o usuário padrão criado na primeira inicialização da API.

---

## 📝 COMO CRIAR NOVOS USUÁRIOS

### Opção 1: Via API REST (Recomendado)

#### Endpoint de Registro
```http
POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register
Content-Type: application/json

{
  "email": "novo@usuario.com",
  "password": "senha123",
  "name": "Nome do Usuário",
  "company": "Nome da Empresa" // opcional
}
```

#### Exemplo com curl:
```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novo@usuario.com",
    "password": "senha123",
    "name": "João Silva",
    "company": "Minha Empresa"
  }'
```

#### Resposta de Sucesso:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 2,
    "email": "novo@usuario.com",
    "name": "João Silva",
    "company": "Minha Empresa"
  },
  "sessionId": "user_2",
  "message": "Usuário criado! Sua sessão WhatsApp está sendo inicializada em background."
}
```

**✅ Ao criar um usuário:**
- Senha é automaticamente criptografada (bcrypt)
- Token JWT é gerado automaticamente
- Sessão WhatsApp é criada automaticamente em background
- Usuário já pode fazer login imediatamente

---

### Opção 2: Via Interface Web

1. Acesse: `https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/`
2. Clique em "Criar Conta" ou "Registrar"
3. Preencha os dados:
   - Email
   - Senha
   - Nome
   - Empresa (opcional)
4. Clique em "Criar Conta"

---

### Opção 3: Via Lovable (Após Integração)

Adicione um componente de registro no Lovable:

```typescript
// src/components/Register.tsx
import { useState } from 'react';
import { whatsappApi } from '@/services/whatsappApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleRegister = async () => {
    if (!email || !password || !name) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha email, senha e nome',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name, company }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao criar conta');
      }

      const data = await response.json();
      
      // Salvar token
      localStorage.setItem('whatsapp_token', data.token);
      localStorage.setItem('whatsapp_session_id', data.sessionId);
      
      toast({
        title: 'Conta criada!',
        description: 'Sua sessão WhatsApp está sendo inicializada',
      });
      
      // Redirecionar ou atualizar estado
      window.location.reload();
    } catch (error: any) {
      toast({
        title: 'Erro ao criar conta',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Criar Conta</h2>
      
      <div className="space-y-4">
        <Input
          type="text"
          placeholder="Nome completo"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        
        <Input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        
        <Input
          type="text"
          placeholder="Empresa (opcional)"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        
        <Button 
          onClick={handleRegister}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? 'Criando conta...' : 'Criar Conta'}
        </Button>
      </div>
    </Card>
  );
}
```

---

## 🔄 FLUXO DE CRIAÇÃO DE USUÁRIO

```
1. Usuário envia dados (email, senha, nome, empresa)
   ↓
2. API valida se email já existe
   ↓
3. Senha é criptografada com bcrypt
   ↓
4. Usuário é salvo no banco SQLite
   ↓
5. Token JWT é gerado automaticamente
   ↓
6. Sessão WhatsApp é criada em background
   ↓
7. Retorna: token, dados do usuário, sessionId
```

---

## 📋 CAMPOS OBRIGATÓRIOS

### Registro:
- ✅ **email** (string, único)
- ✅ **password** (string, min 6 caracteres recomendado)
- ✅ **name** (string)
- ⚪ **company** (string, opcional)

### Login:
- ✅ **email** (string)
- ✅ **password** (string)

---

## 🔒 SEGURANÇA

### Senha:
- Criptografada com **bcrypt** (salt rounds: 10)
- Nunca retornada nas respostas da API
- Verificação segura com `bcrypt.compareSync()`

### Token JWT:
- Gerado automaticamente no registro/login
- Expira em **7 dias**
- Contém apenas `userId` no payload
- Necessário para todas as requisições autenticadas

---

## 🧪 TESTAR CRIAÇÃO DE USUÁRIO

### 1. Via curl:
```bash
# Criar usuário
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@exemplo.com",
    "password": "senha123",
    "name": "Usuário Teste",
    "company": "Empresa Teste"
  }'

# Fazer login
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@exemplo.com",
    "password": "senha123"
  }'
```

### 2. Via Postman/Insomnia:
```
POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register

Headers:
  Content-Type: application/json

Body (JSON):
{
  "email": "teste@exemplo.com",
  "password": "senha123",
  "name": "Usuário Teste",
  "company": "Empresa Teste"
}
```

---

## ❌ ERROS COMUNS

### 1. Email já cadastrado
```json
{
  "error": "Email já cadastrado"
}
```
**Solução:** Use outro email ou faça login com o existente

### 2. Campos obrigatórios faltando
```json
{
  "error": "Email, senha e nome são obrigatórios"
}
```
**Solução:** Preencha todos os campos obrigatórios

### 3. Credenciais inválidas (login)
```json
{
  "error": "Credenciais inválidas"
}
```
**Solução:** Verifique email e senha

---

## 📊 GERENCIAR USUÁRIOS

### Listar todos os usuários (via banco de dados):

Se você tiver acesso ao servidor Koyeb:

```bash
# Conectar ao container
koyeb service exec <service-id> -- sh

# Acessar banco SQLite
sqlite3 data/whatsapp.db

# Listar usuários
SELECT id, email, name, company, created_at FROM users;

# Sair
.exit
```

### Deletar usuário (via banco de dados):
```sql
DELETE FROM users WHERE email = 'usuario@exemplo.com';
```

**⚠️ CUIDADO:** Deletar usuário também deleta suas sessões e mensagens (cascade).

---

## 🔑 RESUMO RÁPIDO

### Criar Usuário:
```bash
POST /api/auth/register
Body: { email, password, name, company? }
```

### Fazer Login:
```bash
POST /api/auth/login
Body: { email, password }
```

### Usuário Padrão:
```
Email: admin@flow.com
Senha: admin123
```

---

## 📝 PROMPT PARA LOVABLE (Adicionar Registro)

Cole no Lovable para adicionar tela de registro:

```
Adicione uma tela de registro de usuários ao projeto.

Endpoint: POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register

Campos:
- email (obrigatório)
- password (obrigatório)
- name (obrigatório)
- company (opcional)

Crie componente Register.tsx com:
- Formulário com os campos acima
- Validação de campos obrigatórios
- Botão "Criar Conta"
- Toast de sucesso/erro
- Após sucesso, salvar token no localStorage e redirecionar

Use shadcn/ui (Input, Button, Card).
```

---

**Última atualização:** Guia completo de usuários e credenciais
