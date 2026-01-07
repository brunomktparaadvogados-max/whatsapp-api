# Gerenciamento de Sessões WhatsApp pelo Admin

## Resumo das Mudanças

A interface web agora permite que o administrador (`admin@flow.com`) gerencie as sessões WhatsApp de todos os usuários diretamente da lista "Todos os Usuários", incluindo:

- ✅ Criar sessão WhatsApp para qualquer usuário
- ✅ Visualizar QR Code de qualquer sessão
- ✅ Ver status de conexão em tempo real
- ✅ Desconectar/deletar sessões
- ✅ Atualizar status das sessões

## Funcionalidades Implementadas

### 1. Interface do Admin

Na seção "Todos os Usuários", cada usuário agora possui:

```
┌─────────────────────────────────────────────┐
│ 👤 Nome do Usuário (email@exemplo.com)      │
│                                             │
│ 📱 Sessão WhatsApp: [Status Badge]          │
│                                             │
│ [Criar Sessão] [Ver QR Code] [Desconectar] │
│ [Atualizar Status]                          │
│                                             │
│ [QR Code exibido aqui quando disponível]   │
└─────────────────────────────────────────────┘
```

### 2. Status de Sessão

Os status são exibidos com badges coloridos:

- 🟢 **Conectado** (verde) - WhatsApp conectado e funcionando
- 🟡 **Aguardando QR** (amarelo) - Sessão criada, aguardando scan do QR
- 🔴 **Desconectado** (vermelho) - Sessão desconectada ou não criada
- ⚪ **Sem Sessão** (cinza) - Usuário ainda não possui sessão

### 3. Ações Disponíveis

#### Criar Sessão
- Botão: "Criar Sessão WhatsApp"
- Cria uma nova sessão para o usuário
- Gera automaticamente o QR Code
- ID da sessão: `user_{userId}`

#### Ver QR Code
- Botão: "Ver QR Code"
- Exibe o QR Code para scan no WhatsApp
- Atualiza automaticamente quando disponível
- Mostra mensagem se QR não estiver disponível

#### Desconectar
- Botão: "Desconectar"
- Desconecta e deleta a sessão do usuário
- Remove autenticação do WhatsApp
- Requer confirmação

#### Atualizar Status
- Botão: "Atualizar Status"
- Busca o status atual da sessão
- Atualiza o badge de status
- Atualiza o QR Code se disponível

## Mudanças Técnicas

### 1. Frontend (`index.html`)

#### Nova Função: `loadAllUsers()`
```javascript
async function loadAllUsers() {
  // Carrega todos os usuários
  // Para cada usuário, busca sua sessão
  // Exibe controles de gerenciamento
  // Mostra QR Code quando disponível
}
```

#### Novas Funções de Gerenciamento:
- `toggleUserSession(userId)` - Expande/colapsa controles de sessão
- `createUserSession(userId)` - Cria sessão para usuário específico
- `refreshUserSession(userId)` - Atualiza status da sessão
- `disconnectUserSession(userId, sessionId)` - Desconecta sessão
- `getStatusClass(status)` - Retorna classe CSS para badge de status

### 2. Backend (`server.js`)

#### Endpoints Modificados:

**GET `/api/sessions/:sessionId`**
```javascript
// Antes: Apenas o dono da sessão podia acessar
// Agora: Admin pode acessar qualquer sessão
if (!isAdmin && dbSession.user_id !== req.userId) {
  return res.status(403).json({ error: 'Acesso negado' });
}
```

**GET `/api/sessions/:sessionId/qr`**
```javascript
// Antes: Apenas o dono podia ver o QR Code
// Agora: Admin pode ver QR Code de qualquer sessão
```

**DELETE `/api/sessions/:sessionId`**
```javascript
// Antes: Apenas o dono podia deletar
// Agora: Admin pode deletar qualquer sessão
```

### 3. Segurança

Todas as verificações de permissão seguem o padrão:

```javascript
const currentUser = await db.getUserById(req.userId);
const isAdmin = currentUser.email === 'admin@flow.com';

if (!isAdmin && dbSession.user_id !== req.userId) {
  return res.status(403).json({ error: 'Acesso negado' });
}
```

## Como Usar

### Para o Administrador:

1. **Login como Admin**
   - Email: `admin@flow.com`
   - Senha: `admin123`

2. **Acessar Lista de Usuários**
   - Role até a seção "Todos os Usuários"
   - Veja todos os usuários cadastrados

3. **Gerenciar Sessão de um Usuário**
   - Clique no nome do usuário para expandir
   - Veja o status atual da sessão
   - Use os botões para gerenciar

4. **Criar Nova Sessão**
   - Clique em "Criar Sessão WhatsApp"
   - Aguarde o QR Code aparecer
   - Peça ao usuário para escanear o QR

5. **Visualizar QR Code**
   - Clique em "Ver QR Code"
   - QR Code aparece abaixo dos botões
   - Compartilhe com o usuário para scan

6. **Desconectar Sessão**
   - Clique em "Desconectar"
   - Confirme a ação
   - Sessão será removida

## Fluxo de Trabalho Recomendado

### Novo Usuário:
1. Admin cria conta do usuário
2. Admin cria sessão WhatsApp para o usuário
3. Admin visualiza QR Code
4. Admin compartilha QR Code com usuário
5. Usuário escaneia QR Code no WhatsApp
6. Sessão fica conectada

### Usuário com Problemas:
1. Admin verifica status da sessão
2. Se desconectado, admin desconecta sessão antiga
3. Admin cria nova sessão
4. Admin compartilha novo QR Code
5. Usuário escaneia novo QR Code

## Testes

### Teste 1: Criar Sessão
```bash
# Como admin, criar sessão para usuário ID 2
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/sessions \
  -H "Authorization: Bearer {ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "user_2"}'
```

### Teste 2: Ver QR Code
```bash
# Como admin, ver QR Code do usuário ID 2
curl https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/sessions/user_2/qr \
  -H "Authorization: Bearer {ADMIN_TOKEN}"
```

### Teste 3: Desconectar Sessão
```bash
# Como admin, desconectar sessão do usuário ID 2
curl -X DELETE https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/sessions/user_2 \
  -H "Authorization: Bearer {ADMIN_TOKEN}"
```

## Logs do Servidor

Ao gerenciar sessões, você verá logs como:

```
[SessionManager] Criando sessão: user_2
[SessionManager] QR Code gerado para user_2
[SessionManager] Sessão user_2 conectada
[SessionManager] Deletando sessão: user_2
```

## Troubleshooting

### QR Code não aparece
- Aguarde alguns segundos após criar a sessão
- Clique em "Atualizar Status"
- Verifique os logs do servidor no Koyeb

### Sessão não conecta
- Verifique se o QR Code foi escaneado corretamente
- Tente desconectar e criar nova sessão
- Verifique se o WhatsApp está atualizado

### Erro "Acesso negado"
- Verifique se está logado como admin
- Faça logout e login novamente
- Limpe o cache do navegador

### Sessão desconecta sozinha
- Verifique a conexão do servidor no Koyeb
- Pode ser problema de memória/recursos
- Tente reiniciar o serviço no Koyeb

## Próximos Passos

Possíveis melhorias futuras:

1. **Notificações em Tempo Real**
   - WebSocket para atualizar status automaticamente
   - Notificar quando sessão conectar/desconectar

2. **Histórico de Sessões**
   - Registrar quando sessões foram criadas/deletadas
   - Mostrar quem fez cada ação

3. **Bulk Actions**
   - Criar sessões para múltiplos usuários
   - Desconectar todas as sessões inativas

4. **Estatísticas**
   - Quantas sessões ativas
   - Tempo médio de conexão
   - Usuários sem sessão

## Conclusão

O administrador agora tem controle completo sobre as sessões WhatsApp de todos os usuários, facilitando o suporte e a gestão do sistema. Todas as ações são seguras e verificadas no backend.
