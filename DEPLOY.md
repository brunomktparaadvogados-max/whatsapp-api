# 🚀 Guia de Deploy

## Deploy Local

### 1. Com Docker (Recomendado)

```bash
cd whatsapp-api
docker-compose up -d
```

### 2. Com Node.js

```bash
cd whatsapp-api
npm install
npm start
```

## Deploy em Servidor VPS (Ubuntu/Debian)

### 1. Instalar Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Instalar dependências do Chrome

```bash
sudo apt-get update
sudo apt-get install -y \
  gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
  libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
  libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates \
  fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
```

### 3. Clonar e configurar

```bash
cd /opt
git clone <seu-repositorio> whatsapp-api
cd whatsapp-api
npm install
cp .env.example .env
```

### 4. Configurar PM2 (Process Manager)

```bash
sudo npm install -g pm2
pm2 start src/server.js --name whatsapp-api
pm2 startup
pm2 save
```

### 5. Configurar Nginx (Proxy Reverso)

```bash
sudo apt-get install nginx

sudo nano /etc/nginx/sites-available/whatsapp-api
```

Adicione:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/whatsapp-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. SSL com Let's Encrypt (Opcional)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

## Deploy com Docker em VPS

```bash
cd /opt
git clone <seu-repositorio> whatsapp-api
cd whatsapp-api
docker-compose up -d
```

## Deploy na Railway

1. Crie conta em https://railway.app
2. Conecte seu repositório GitHub
3. Configure as variáveis de ambiente
4. Deploy automático!

## Deploy no Render

1. Crie conta em https://render.com
2. New > Web Service
3. Conecte seu repositório
4. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Deploy!

## Deploy no Heroku

```bash
heroku login
heroku create minha-whatsapp-api
git push heroku main
```

## Variáveis de Ambiente

```env
PORT=3000
HOST=0.0.0.0
SESSION_DIR=./sessions
```

## Monitoramento

### Com PM2

```bash
pm2 logs whatsapp-api
pm2 monit
pm2 restart whatsapp-api
```

### Logs do Docker

```bash
docker-compose logs -f
```

## Backup

Faça backup regular da pasta `sessions`:

```bash
tar -czf sessions-backup-$(date +%Y%m%d).tar.gz sessions/
```

## Segurança

1. **Firewall**: Abra apenas as portas necessárias
2. **SSL**: Use sempre HTTPS em produção
3. **Autenticação**: Adicione autenticação à API se exposta publicamente
4. **Rate Limiting**: Implemente limitação de requisições

## Troubleshooting

### Erro: "Failed to launch chrome"

```bash
sudo apt-get install -y chromium-browser
```

### Erro: "ENOSPC: System limit for number of file watchers reached"

```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Sessão não conecta

1. Delete a pasta da sessão em `sessions/`
2. Recrie a sessão
3. Escaneie o QR Code novamente
