# INTEGRAÇÃO FLOW + PYTHON - AUTOMAÇÃO VIA API

## 🎯 O que foi criado?

Uma API REST local que permite ao sistema Flow (Lovable) iniciar e controlar a automação Python diretamente do navegador.

## 📋 Arquivos criados

1. **api_automacao.py** - Servidor Flask com endpoints REST
2. **iniciar_api.ps1** - Script PowerShell para iniciar o servidor
3. **requirements.txt** - Dependências atualizadas

## 🚀 Como usar

### Passo 1: Preparar o ambiente

```powershell
# Instalar dependências
pip install -r requirements.txt
```

### Passo 2: Iniciar o Chrome em modo debug

```powershell
.\abrir_chrome_debug.bat
```

Faça login no Mind-7 e abra o Flow em outra aba.

### Passo 3: Iniciar a API

```powershell
.\iniciar_api.ps1
```

A API estará disponível em: `http://localhost:5000`

### Passo 4: Integrar no Flow (Lovable)

No seu projeto Lovable/Flow, adicione este código JavaScript:

```javascript
// Função para iniciar automação
async function iniciarAutomacao(caminhoPDF) {
  try {
    const response = await fetch('http://localhost:5000/api/iniciar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        caminho_pdf: caminhoPDF
      })
    });
    
    const data = await response.json();
    
    if (data.sucesso) {
      console.log('Automação iniciada!');
      monitorarStatus();
    } else {
      console.error('Erro:', data.mensagem);
    }
  } catch (error) {
    console.error('Erro ao conectar com API:', error);
  }
}

// Função para monitorar status
async function monitorarStatus() {
  const interval = setInterval(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/status');
      const status = await response.json();
      
      console.log('Status:', status.mensagem);
      console.log('Adicionados:', status.adicionados);
      console.log('Pulados:', status.pulados);
      
      if (!status.rodando) {
        clearInterval(interval);
        console.log('Automação finalizada!');
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      clearInterval(interval);
    }
  }, 2000);
}

// Função para parar automação
async function pararAutomacao() {
  try {
    const response = await fetch('http://localhost:5000/api/parar', {
      method: 'POST'
    });
    
    const data = await response.json();
    console.log(data.mensagem);
  } catch (error) {
    console.error('Erro ao parar automação:', error);
  }
}

// Exemplo de uso em um botão
document.getElementById('btnIniciarAutomacao').addEventListener('click', () => {
  const caminhoPDF = document.getElementById('inputCaminhoPDF').value;
  iniciarAutomacao(caminhoPDF);
});
```

### Passo 5: Adicionar componente React no Flow

```typescript
import { useState } from 'react';

export function AutomacaoControl() {
  const [caminhoPDF, setCaminhoPDF] = useState('');
  const [status, setStatus] = useState('');
  const [rodando, setRodando] = useState(false);

  const iniciarAutomacao = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caminho_pdf: caminhoPDF })
      });
      
      const data = await response.json();
      
      if (data.sucesso) {
        setRodando(true);
        setStatus('Automação iniciada!');
        monitorarStatus();
      } else {
        setStatus(`Erro: ${data.mensagem}`);
      }
    } catch (error) {
      setStatus('Erro ao conectar com API');
    }
  };

  const monitorarStatus = () => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:5000/api/status');
        const statusData = await response.json();
        
        setStatus(`${statusData.mensagem} - Adicionados: ${statusData.adicionados}, Pulados: ${statusData.pulados}`);
        
        if (!statusData.rodando) {
          clearInterval(interval);
          setRodando(false);
        }
      } catch (error) {
        clearInterval(interval);
        setRodando(false);
      }
    }, 2000);
  };

  const pararAutomacao = async () => {
    try {
      await fetch('http://localhost:5000/api/parar', { method: 'POST' });
      setRodando(false);
      setStatus('Automação parada');
    } catch (error) {
      setStatus('Erro ao parar automação');
    }
  };

  return (
    <div className="p-4 border rounded">
      <h2 className="text-xl font-bold mb-4">Controle de Automação</h2>
      
      <div className="mb-4">
        <label className="block mb-2">Caminho do PDF:</label>
        <input
          type="text"
          value={caminhoDF}
          onChange={(e) => setCaminhoDF(e.target.value)}
          placeholder="C:\Users\...\edital.pdf"
          className="w-full p-2 border rounded"
          disabled={rodando}
        />
      </div>
      
      <div className="flex gap-2 mb-4">
        <button
          onClick={iniciarAutomacao}
          disabled={rodando || !caminhoDF}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
        >
          {rodando ? 'Rodando...' : 'Iniciar Automação'}
        </button>
        
        <button
          onClick={pararAutomacao}
          disabled={!rodando}
          className="px-4 py-2 bg-red-500 text-white rounded disabled:bg-gray-300"
        >
          Parar
        </button>
      </div>
      
      {status && (
        <div className="p-3 bg-gray-100 rounded">
          <p className="text-sm">{status}</p>
        </div>
      )}
    </div>
  );
}
```

## 🔌 Endpoints da API

### GET /api/health
Verifica se a API está online.

**Resposta:**
```json
{
  "status": "online",
  "mensagem": "API de automação funcionando"
}
```

### GET /api/status
Retorna o status atual da automação.

**Resposta:**
```json
{
  "rodando": true,
  "progresso": 5,
  "total": 10,
  "mensagem": "Processando...",
  "adicionados": 3,
  "pulados": 2
}
```

### POST /api/iniciar
Inicia a automação.

**Body:**
```json
{
  "caminho_pdf": "C:\\Users\\...\\edital.pdf"
}
```

**Resposta:**
```json
{
  "sucesso": true,
  "mensagem": "Automação iniciada com sucesso"
}
```

### POST /api/parar
Para a automação em execução.

**Resposta:**
```json
{
  "sucesso": true,
  "mensagem": "Automação parada"
}
```

## 🔒 Segurança

⚠️ **IMPORTANTE**: Esta API roda localmente (localhost) e não deve ser exposta à internet.

- A API aceita conexões apenas de `localhost` por padrão
- CORS está habilitado para permitir requisições do navegador
- Não há autenticação (adequado apenas para uso local)

## 🐛 Troubleshooting

### Erro: "Navegador não conectado"
- Certifique-se de que o Chrome está rodando em modo debug
- Execute: `.\abrir_chrome_debug.bat`
- Faça login no Mind-7 e Flow

### Erro: "Arquivo não encontrado"
- Verifique se o caminho do PDF está correto
- Use caminho absoluto: `C:\Users\...\arquivo.pdf`
- Certifique-se de usar barras invertidas duplas no JSON

### Erro de CORS no navegador
- Verifique se a API está rodando
- Teste: `http://localhost:5000/api/health`
- O CORS já está configurado no servidor

### API não inicia
- Verifique se a porta 5000 está livre
- Instale as dependências: `pip install -r requirements.txt`
- Verifique se Python está instalado

## 📝 Exemplo completo de uso

1. **Iniciar Chrome debug:**
```powershell
.\abrir_chrome_debug.bat
```

2. **Fazer login no Mind-7 e Flow**

3. **Iniciar API:**
```powershell
.\iniciar_api.ps1
```

4. **No Flow, adicionar botão:**
```typescript
<button onClick={() => {
  fetch('http://localhost:5000/api/iniciar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caminho_pdf: 'C:\\Users\\Downloads\\edital.pdf'
    })
  });
}}>
  Iniciar Automação
</button>
```

5. **Monitorar progresso no console do navegador**

## 🎉 Pronto!

Agora você pode controlar a automação Python diretamente do sistema Flow no navegador!
