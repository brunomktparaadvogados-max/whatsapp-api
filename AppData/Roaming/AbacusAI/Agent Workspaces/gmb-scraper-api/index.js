const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'API de Extração de Perfis do Google Meu Negócio',
    version: '1.0.0',
    endpoints: {
      health: 'GET /',
      processar: 'POST /api/gmb/processar',
      extrair: 'POST /api/gmb/extrair'
    },
    descricao: 'API para processar perfis do Google Meu Negócio copiados e colados, extraindo contatos, site e informações de contato do site'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/gmb/processar', async (req, res) => {
  try {
    const { texto } = req.body;

    if (!texto) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Campo obrigatório: texto (conteúdo copiado do perfil do Google Meu Negócio)'
      });
    }

    console.log(`[GMB PROCESSAR] Iniciando processamento de texto...`);
    console.log(`[GMB PROCESSAR] Tamanho do texto: ${texto.length} caracteres`);

    const perfis = extrairPerfisDoTexto(texto);

    console.log(`[GMB PROCESSAR] Encontrados ${perfis.length} perfis`);

    return res.json({
      sucesso: true,
      total: perfis.length,
      perfis: perfis
    });

  } catch (error) {
    console.error('[ERRO]', error.message);
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

function extrairPerfisDoTexto(texto) {
  const perfis = [];
  
  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let perfilAtual = {
    nome: '',
    categoria: '',
    avaliacao: '',
    total_avaliacoes: '',
    endereco: '',
    telefone: '',
    site: '',
    horarios: [],
    contatos_site: []
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    
    if (linha.match(/^\d+[.,]\d+\s*★/)) {
      const match = linha.match(/^(\d+[.,]\d+)\s*★\s*\(?([\d.]+)\)?/);
      if (match) {
        perfilAtual.avaliacao = match[1];
        perfilAtual.total_avaliacoes = match[2];
      }
    }
    
    else if (linha.match(/^\(\d{2}\)\s*\d{4,5}-\d{4}/) || linha.match(/^\d{2}\s*\d{4,5}-\d{4}/)) {
      perfilAtual.telefone = linha;
    }
    
    else if (linha.match(/^https?:\/\//i) || linha.match(/^www\./i)) {
      perfilAtual.site = linha.startsWith('www.') ? 'https://' + linha : linha;
    }
    
    else if (linha.match(/^(Rua|Av\.|Avenida|Travessa|Alameda|Praça)/i)) {
      perfilAtual.endereco = linha;
    }
    
    else if (linha.match(/^(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i)) {
      perfilAtual.horarios.push(linha);
    }
    
    else if (linha.match(/^(Restaurante|Loja|Clínica|Consultório|Escritório|Empresa|Serviço|Hotel|Pousada|Bar|Café|Padaria|Farmácia|Academia|Salão|Barbearia|Pet Shop|Oficina|Autopeças|Supermercado|Mercado|Açougue|Peixaria|Hortifruti|Floricultura|Joalheria|Ótica|Livraria|Papelaria|Informática|Eletrônica|Móveis|Decoração|Construção|Imobiliária|Advocacia|Contabilidade|Arquitetura|Engenharia|Dentista|Médico|Fisioterapia|Psicologia|Nutrição|Estética|Manicure|Cabeleireiro|Massagem|Yoga|Pilates|Crossfit|Musculação|Natação|Dança|Teatro|Cinema|Escola|Curso|Faculdade|Universidade|Creche|Berçário)/i)) {
      perfilAtual.categoria = linha;
    }
    
    else if (!perfilAtual.nome && linha.length > 3 && linha.length < 100 && !linha.match(/^\d/)) {
      perfilAtual.nome = linha;
    }
  }

  if (perfilAtual.nome || perfilAtual.telefone || perfilAtual.site) {
    perfis.push({ ...perfilAtual });
  }

  return perfis;
}

app.post('/api/gmb/extrair', async (req, res) => {
  try {
    const { perfis } = req.body;

    if (!perfis || !Array.isArray(perfis)) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Campo obrigatório: perfis (array de perfis processados)'
      });
    }

    console.log(`[GMB EXTRAIR] Iniciando extração de contatos de ${perfis.length} perfis...`);

    const perfisEnriquecidos = [];

    for (const perfil of perfis) {
      if (perfil.site) {
        console.log(`[GMB EXTRAIR] Extraindo contatos do site: ${perfil.site}`);
        
        try {
          const contatosSite = await extrairContatosDoSite(perfil.site);
          perfil.contatos_site = contatosSite;
          console.log(`[GMB EXTRAIR] Encontrados ${contatosSite.length} contatos no site`);
        } catch (error) {
          console.error(`[GMB EXTRAIR ERRO] Erro ao extrair contatos de ${perfil.site}:`, error.message);
          perfil.contatos_site = [];
        }
      }

      perfisEnriquecidos.push(perfil);
    }

    console.log(`[GMB EXTRAIR] Extração concluída`);

    return res.json({
      sucesso: true,
      total: perfisEnriquecidos.length,
      perfis: perfisEnriquecidos
    });

  } catch (error) {
    console.error('[ERRO]', error.message);
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

async function extrairContatosDoSite(url) {
  const contatos = {
    telefones: [],
    emails: [],
    whatsapp: [],
    instagram: [],
    facebook: []
  };

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const textoCompleto = $('body').text();
    const html = response.data;

    const regexTelefone = /(?:\+55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4,5}[-\s]?\d{4}/g;
    const telefones = textoCompleto.match(regexTelefone) || [];
    contatos.telefones = [...new Set(telefones)].slice(0, 5);

    const regexEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = textoCompleto.match(regexEmail) || [];
    contatos.emails = [...new Set(emails)].filter(email => 
      !email.includes('example.com') && 
      !email.includes('sentry.io') &&
      !email.includes('wixpress.com')
    ).slice(0, 5);

    const regexWhatsAppAPI = /(?:wa\.me|api\.whatsapp\.com\/send)\/?\??(?:phone=)?(\d{10,15})/gi;
    const regexWhatsAppGeneral = /(?:whatsapp\.com)\/(?:send\?phone=)?(\d+)/gi;

    let match;
    while ((match = regexWhatsAppAPI.exec(html)) !== null) {
      contatos.whatsapp.push(match[1]);
    }

    while ((match = regexWhatsAppGeneral.exec(html)) !== null) {
      contatos.whatsapp.push(match[1]);
    }

    contatos.whatsapp = [...new Set(contatos.whatsapp)];

    const regexInstagram = /(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9._]+)/gi;
    while ((match = regexInstagram.exec(html)) !== null) {
      const username = match[1];
      if (!['explore', 'accounts', 'direct', 'stories', 'reels', 'p', 'tv'].includes(username)) {
        contatos.instagram.push(username);
      }
    }
    contatos.instagram = [...new Set(contatos.instagram)].slice(0, 3);

    const regexFacebook = /(?:facebook\.com|fb\.com)\/([a-zA-Z0-9.]+)/gi;
    while ((match = regexFacebook.exec(html)) !== null) {
      const page = match[1];
      if (!['sharer', 'share', 'login', 'help', 'pages'].includes(page)) {
        contatos.facebook.push(page);
      }
    }
    contatos.facebook = [...new Set(contatos.facebook)].slice(0, 3);

  } catch (error) {
    console.error(`[EXTRAIR CONTATOS ERRO] ${url}:`, error.message);
  }

  return contatos;
}

const server = app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🚀 API GMB SCRAPER - GOOGLE MEU NEGÓCIO');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  ✅ Servidor rodando na porta: ${PORT}`);
  console.log(`  🌐 URL: http://localhost:${PORT}`);
  console.log('');
  console.log('  📋 Endpoints disponíveis:');
  console.log(`     GET  /              - Informações da API`);
  console.log(`     GET  /health        - Status da API`);
  console.log(`     POST /api/gmb/processar - Processar texto copiado do GMB`);
  console.log(`     POST /api/gmb/extrair   - Extrair contatos dos sites`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM recebido, fechando servidor...');
  server.close(() => {
    console.log('Servidor fechado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT recebido, fechando servidor...');
  server.close(() => {
    console.log('Servidor fechado');
    process.exit(0);
  });
});
