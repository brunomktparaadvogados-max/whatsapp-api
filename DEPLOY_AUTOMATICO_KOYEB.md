# Deploy Automático no Koyeb - Correção de Token

## ✅ Alterações Enviadas

**Commit**: `ca97536`
**Branch**: `main`
**Repositório**: `https://github.com/brunomktparaadvogados-max/whatsapp-api.git`

### Arquivos Modificados:
1. ✅ `public/index.html` - Correções nas funções de carregamento
2. ✅ `CORRECAO_TOKEN_USUARIOS.md` - Documentação das correções

## 🚀 Deploy Automático

O Koyeb está configurado para fazer deploy automático quando detectar mudanças no repositório GitHub.

**Status**: O deploy deve iniciar automaticamente em alguns segundos.

## ⚙️ Configuração Necessária no Koyeb

### IMPORTANTE: Configure a variável JWT_SECRET

Para evitar que os tokens expirem após cada deploy, você precisa configurar uma variável de ambiente fixa:

1. **Acesse o Koyeb Dashboard**: https://app.koyeb.com/
2. **Selecione seu serviço**: whatsapp-api
3. **Vá em**: Settings → Environment Variables
4. **Adicione a variável**:
   - **Nome**: `JWT_SECRET`
   - **Valor**: `whatsapp-api-flow-2024-super-secret-key-bruno-mkt`
   - **Tipo**: Secret (recomendado) ou Plain Text

5. **Salve e Redeploy**

### Outras Variáveis Importantes

Verifique se estas variáveis estão configuradas:

- ✅ `DATABASE_URL` - URL do PostgreSQL (Supabase ou outro)
- ✅ `NODE_ENV` - `production`
- ✅ `PORT` - `8000` (ou deixe o Koyeb definir automaticamente)
- ✅ `JWT_SECRET` - **ADICIONE ESTA!**

## 📋 Próximos Passos

### 1. Aguarde o Deploy (2-5 minutos)
O Koyeb detectará o push e iniciará o build automaticamente.

### 2. Configure o JWT_SECRET
Siga as instruções acima para adicionar a variável de ambiente.

### 3. Teste a Aplicação
Após o deploy:
1. Acesse: https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/
2. Limpe o cache do navegador: `localStorage.clear()`
3. Faça login novamente
4. Teste o carregamento de usuários

## 🔍 Monitorar Deploy

### Via Koyeb Dashboard:
1. Acesse: https://app.koyeb.com/
2. Clique no seu serviço
3. Veja a aba "Deployments"
4. Acompanhe o progresso do build

### Via Logs:
```bash
# Se você tiver a CLI do Koyeb instalada
koyeb logs whatsapp-api
```

## ✅ Verificação Pós-Deploy

Execute estes testes após o deploy:

### 1. Teste de Health Check
```bash
curl https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/
```

### 2. Teste de Login
```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flow.com","password":"sua-senha"}'
```

### 3. Teste de Listagem de Usuários
```bash
curl https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/users \
  -H "Authorization: Bearer SEU_TOKEN"
```

## 🐛 Troubleshooting

### Se o erro persistir:

1. **Verifique os logs do Koyeb**
   - Procure por erros de conexão com banco de dados
   - Verifique se todas as variáveis de ambiente estão corretas

2. **Limpe o cache do navegador**
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

3. **Recrie o usuário admin** (se necessário)
   - Acesse o banco de dados diretamente
   - Ou use o endpoint de registro

4. **Verifique a conexão com o banco**
   - Teste a URL do DATABASE_URL
   - Confirme que o Supabase está ativo

## 📞 Suporte

Se precisar de ajuda adicional:
- Verifique os logs no Koyeb Dashboard
- Consulte a documentação em `CORRECAO_TOKEN_USUARIOS.md`
- Revise o `README.md` para configuração completa
