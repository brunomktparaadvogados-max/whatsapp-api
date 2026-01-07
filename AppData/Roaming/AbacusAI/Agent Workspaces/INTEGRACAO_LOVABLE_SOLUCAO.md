# 🌐 COMO INTEGRAR API WHATSAPP COM LOVABLE

## ⚠️ PROBLEMA

O Lovable roda em um servidor hospedado e não consegue acessar `http://localhost:3000` porque localhost é local da sua máquina.

## ✅ SOLUÇÃO

Você precisa expor sua API local para a internet usando um túnel público.

---

## 🚀 PASSO A PASSO

### 1. Expor a API Publicamente

Execute um dos scripts:

**Windows (CMD):**
```cmd
EXPOR_API_PUBLICAMENTE.bat
```

**Windows (PowerShell):**
```powershell
.\EXPOR_API_PUBLICAMENTE.ps1
```

### 2. Copiar a URL Pública

O script vai exibir uma URL pública, algo como:
```
your url is: https://xxxxx-xxx-xxx.loca.lt
```

**COPIE ESSA URL!**

### 3. Configurar no Lovable

No chat do Lovable, cole este comando:

```
Configure a variável de ambiente VITE_WHATSAPP_API_URL com o valor:
https://xxxxx-xxx-xxx.loca.lt

(substitua pela URL que você copiou)
```

### 4. Testar a Integração

Após configurar, o Lovable vai conseguir acessar sua API através da URL pública.

---

## 🔄 ALTERNATIVAS

### Opção 1: Usar ngrok (Recomendado para produção)

1. Instale o ngrok: https://ngrok.com/download
2. Execute: `ngrok http 3000`
3. Use a URL fornecida no Lovable

### Opção 2: Deploy da API em um servidor

Deploy a API em:
- Heroku
- Railway
- Render
- DigitalOcean
- AWS

E use a URL do servidor no Lovable.

---

## 📝 NOTAS IMPORTANTES

1. **Localtunnel é gratuito mas temporário**: A URL muda cada vez que você reinicia
2. **Mantenha a API rodando**: Não feche o terminal da API
3. **Mantenha o túnel rodando**: Não feche o terminal do localtunnel
4. **Primeira vez**: O localtunnel pode pedir para clicar em um botão de confirmação no navegador

---

## 🐛 TROUBLESHOOTING

### "API WhatsApp não está acessível"

1. Verifique se a API está rodando: `curl http://localhost:3000`
2. Verifique se o túnel está ativo
3. Teste a URL pública no navegador
4. Reconfigure a variável no Lovable

### "Connection refused"

1. Reinicie a API
2. Reinicie o túnel
3. Use a nova URL no Lovable

### "Tunnel closed"

1. O túnel foi fechado
2. Execute novamente o script
3. Atualize a URL no Lovable
