# 🔍 Diagnóstico: Problema de Envio de Mensagens

## 📋 Problema Relatado

Usuário criado pelo admin consegue conectar o WhatsApp (QR Code funciona), mas ao tentar enviar mensagem de teste pelo ambiente web, dá erro.

## 🛠️ Ferramentas de Diagnóstico Implementadas

### 1. Logs Detalhados no Servidor

Adicionei logs completos no endpoint de envio de mensagens (`POST /api/messages/send/:sessionId`) que mostram:

- ✅ User ID da requisição
- ✅ Session ID solicitado
- ✅ Sessões encontradas no banco para o usuário
- ✅ Status de cada sessão (banco vs memória)
- ✅ Verificação de permissões
- ✅ Detalhes do erro se houver

### 2. Endpoint de Debug (Admin Only)

**URL:** `GET /api/debug/sessions`

Retorna informações completas sobre:
- 👥 Todos os usuários cadastrados
- 💾 Todas as sessões no banco de dados
- 🧠 Todas as sessões na memória do servidor

### 3. Botão de Debug na Interface

Na seção **"🧹 Manutenção"** da interface admin, há um botão:

**🔍 Ver Debug de Sessões**

Mostra tabelas com:
- Lista de usuários (ID, nome, email)
- Sessões no banco (ID, user_id, status, telefone)
- Sessões na memória (ID, userId, status, cliente ativo)

## 🚀 Como Diagnosticar o Problema

### Passo 1: Aguardar Deploy (3-5 minutos)

O Koyeb está fazendo o deploy das alterações. Aguarde até que o deploy esteja completo.

### Passo 2: Acessar a Interface

1. Acesse: https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/
2. Faça login como admin: `admin@flow.com` / `admin123`

### Passo 3: Ver Debug de Sessões

1. Role até a seção **"🧹 Manutenção"**
2. Clique em **"🔍 Ver Debug de Sessões"**
3. Analise as tabelas:

**Verificar:**
- ✅ O usuário "Bruno Reis" (ID 1) existe na tabela de usuários?
- ✅ A sessão `user_1` existe no banco de dados?
- ✅ O `user_id` da sessão no banco é `1`?
- ✅ A sessão `user_1` está na memória?
- ✅ O `userId` da sessão na memória é `1`?
- ✅ O status da sessão é `connected`?

### Passo 4: Tentar Enviar Mensagem

1. Faça logout do admin
2. Faça login com o usuário Bruno: `contato@advocaciabrunoreis.com.br`
3. Vá até **"📤 Enviar Mensagem"**
4. Deixe o campo "ID da Sessão" vazio (auto-detectar)
5. Preencha:
   - Número: `5511935001870`
   - Mensagem: `Teste`
6. Clique em **"Enviar Mensagem"**

### Passo 5: Verificar Logs do Servidor

Os logs detalhados aparecerão no console do Koyeb. Para acessar:

1. Acesse: https://app.koyeb.com/
2. Vá em **Services** → Seu serviço
3. Clique em **Logs**
4. Procure por linhas com `[SEND MESSAGE]`

**Exemplo de logs esperados:**

```
📤 [SEND MESSAGE] Requisição recebida:
   - User ID: 1
   - Session ID param: auto
   - To: 5511935001870

🔍 [SEND MESSAGE] Auto-detectando sessão para user 1...
   - Sessões encontradas: 1
     * user_1 - Status DB: connected
     * user_1 - Em memória: true - Status: connected - Ativa: true
   - Sessões ativas: 1

✅ [SEND MESSAGE] Sessão auto-detectada: user_1

🔍 [SEND MESSAGE] Verificando sessão user_1 no banco...
   - Sessão encontrada no banco:
     * ID: user_1
     * User ID: 1
     * Status: connected
     * Req User ID: 1

✅ [SEND MESSAGE] Enviando mensagem via SessionManager...
✅ [SEND MESSAGE] Mensagem enviada com sucesso!
```

## 🔎 Possíveis Causas do Erro

### Causa 1: user_id NULL no Banco

**Sintoma:** Logs mostram `User ID: null` na sessão do banco

**Solução:**
```sql
-- Verificar sessões com user_id NULL
SELECT * FROM sessions WHERE user_id IS NULL;

-- Corrigir manualmente (se necessário)
UPDATE sessions SET user_id = 1 WHERE id = 'user_1';
```

### Causa 2: Sessão Não Está na Memória

**Sintoma:** Debug mostra sessão no banco, mas não na memória

**Solução:**
1. Desconectar a sessão
2. Reconectar (escanear QR Code novamente)
3. Verificar se aparece na memória

### Causa 3: Status Não É "connected"

**Sintoma:** Status da sessão é `qr_code`, `initializing` ou `disconnected`

**Solução:**
1. Verificar se o QR Code foi escaneado
2. Verificar se o WhatsApp está aberto no celular
3. Tentar desconectar e reconectar

### Causa 4: Permissão Negada

**Sintoma:** Logs mostram `User ID: X` mas `Req User ID: Y` (diferentes)

**Solução:**
- Verificar se o usuário está logado corretamente
- Verificar se o token JWT está válido
- Fazer logout e login novamente

## 📊 Checklist de Verificação

- [ ] Deploy concluído no Koyeb
- [ ] Botão "🔍 Ver Debug de Sessões" aparece na interface
- [ ] Usuário existe na tabela de usuários
- [ ] Sessão existe no banco de dados
- [ ] `user_id` da sessão no banco está correto
- [ ] Sessão existe na memória
- [ ] `userId` da sessão na memória está correto
- [ ] Status da sessão é `connected`
- [ ] Logs detalhados aparecem no console do Koyeb
- [ ] Mensagem é enviada com sucesso

## 🎯 Próximos Passos

1. **Aguardar deploy** (3-5 minutos)
2. **Clicar em "🔍 Ver Debug de Sessões"**
3. **Compartilhar screenshot** das tabelas de debug
4. **Tentar enviar mensagem** e compartilhar o erro exato
5. **Verificar logs** no Koyeb e compartilhar linhas relevantes

Com essas informações, conseguiremos identificar exatamente onde está o problema!

## 🔧 Comandos Úteis (Se Necessário)

### Limpar Cache do Navegador
```
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)
```

### Abrir Console do Navegador
```
F12 → Aba "Console"
```

### Ver Requisições de Rede
```
F12 → Aba "Network" → Filtrar por "Fetch/XHR"
```

## 📞 Suporte

Se o problema persistir após verificar todos os itens acima, compartilhe:

1. Screenshot da tela de debug
2. Mensagem de erro exata
3. Logs do servidor (se possível)
4. Informações do usuário (ID, email)

---

**Última atualização:** Deploy realizado com logs e debug implementados
**Status:** Aguardando verificação após deploy
