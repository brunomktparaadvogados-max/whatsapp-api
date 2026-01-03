# 🚨 CORREÇÃO URGENTE: ROOT DIRECTORY

## ❌ ERRO:
```
Root directory "whatsapp-api" does not exist
```

## ✅ SOLUÇÃO:

No Render, na configuração do serviço:

### **Root Directory**: 
**DEIXE VAZIO** ou coloque apenas: `.`

### Motivo:
Os arquivos estão na RAIZ do repositório, não dentro de uma subpasta.

### Estrutura correta do repositório:
```
brunomktparaadvogados-max/whatsapp-api/
├── src/
│   ├── server.js
│   ├── SessionManager.js
│   └── ...
├── package.json
├── Dockerfile
└── ...
```

## 📋 PASSOS PARA CORRIGIR:

1. No Render, vá em **"Settings"** (menu lateral)
2. Procure por **"Build & Deploy"**
3. Em **"Root Directory"**, apague `whatsapp-api`
4. Deixe o campo **VAZIO** ou coloque apenas `.`
5. Clique em **"Save Changes"**
6. Vá em **"Manual Deploy"** → **"Deploy latest commit"**

## ✅ PRONTO!

Agora o deploy vai funcionar! 🚀
