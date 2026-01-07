# 🚀 PROMPT PARA LOVABLE - INTEGRAÇÃO API DE AUTOMAÇÃO

## 📋 Copie e cole este prompt no chat do Lovable:

---

Preciso criar uma integração completa com uma API REST local de automação Python. A API já está rodando em `http://localhost:5000` e controla automações de processamento de editais.

## 🎯 OBJETIVO

Criar uma interface no sistema Flow que permita:
1. Verificar se a API está online
2. Iniciar automação enviando caminho do PDF
3. Monitorar progresso em tempo real
4. Parar automação se necessário
5. Exibir estatísticas (adicionados, pulados)

## 🔌 DOCUMENTAÇÃO DA API

### Base URL
```
http://localhost:5000
```

### Endpoints Disponíveis

#### 1. GET /api/health
Verifica se a API está online.

**Resposta:**
```json
{
  "status": "online",
  "mensagem": "API de automação funcionando"
}
```

#### 2. GET /api/status
Retorna o status atual da automação em tempo real.

**Resposta:**
```json
{
  "rodando": true,
  "progresso": 5,
  "total": 10,
  "mensagem": "Processando edital...",
  "adicionados": 3,
  "pulados": 2
}
```

#### 3. POST /api/iniciar
Inicia a automação de processamento.

**Body:**
```json
{
  "caminho_pdf": "C:\\Users\\Downloads\\edital.pdf"
}
```

**Resposta Sucesso:**
```json
{
  "sucesso": true,
  "mensagem": "Automação iniciada com sucesso"
}
```

**Resposta Erro:**
```json
{
  "sucesso": false,
  "mensagem": "Automação já está rodando"
}
```

#### 4. POST /api/parar
Para a automação em execução.

**Resposta:**
```json
{
  "sucesso": true,
  "mensagem": "Automação parada"
}
```

## 🎨 COMPONENTE REACT A CRIAR

Crie um componente chamado `AutomacaoControl` com as seguintes funcionalidades:

### Estados necessários:
- `caminhoPDF`: string - caminho do arquivo PDF
- `status`: objeto - status completo da automação
- `rodando`: boolean - se automação está rodando
- `apiOnline`: boolean - se API está acessível
- `mensagem`: string - mensagem de feedback

### Funções necessárias:

1. **verificarAPI()** - Chama GET /api/health ao montar componente
2. **iniciarAutomacao()** - Chama POST /api/iniciar com caminho do PDF
3. **monitorarStatus()** - Polling GET /api/status a cada 2 segundos
4. **pararAutomacao()** - Chama POST /api/parar
5. **formatarCaminho()** - Converte barras simples em duplas para JSON

### Interface visual deve ter:

1. **Indicador de Status da API**
   - Badge verde "API Online" ou vermelho "API Offline"
   - Verificação automática ao carregar

2. **Campo de Input**
   - Label: "Caminho do PDF do Edital"
   - Placeholder: "C:\Users\Downloads\edital.pdf"
   - Desabilitado quando automação está rodando
   - Validação: não pode estar vazio

3. **Botões de Controle**
   - Botão "Iniciar Automação" (azul)
     - Desabilitado se: API offline, campo vazio, ou já rodando
     - Texto muda para "Rodando..." quando ativo
   - Botão "Parar Automação" (vermelho)
     - Desabilitado se não estiver rodando
     - Apenas visível quando automação está ativa

4. **Painel de Status em Tempo Real**
   - Mensagem atual da automação
   - Barra de progresso (se disponível)
   - Estatísticas:
     - ✅ Adicionados: X
     - ⏭️ Pulados: Y
     - 📊 Progresso: X/Y

5. **Área de Logs/Feedback**
   - Histórico de mensagens
   - Timestamp de cada evento
   - Cores diferentes para sucesso/erro/info

## 💡 REQUISITOS TÉCNICOS

### Tratamento de Erros:
```typescript
try {
  const response = await fetch('http://localhost:5000/api/iniciar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caminho_pdf: caminhoPDF })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  // processar resposta
} catch (error) {
  console.error('Erro ao conectar com API:', error);
  setMensagem('Erro: API não está respondendo');
  setApiOnline(false);
}
```

### Polling de Status:
```typescript
useEffect(() => {
  if (!rodando) return;
  
  const interval = setInterval(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/status');
      const statusData = await response.json();
      
      setStatus(statusData);
      
      if (!statusData.rodando) {
        clearInterval(interval);
        setRodando(false);
      }
    } catch (error) {
      clearInterval(interval);
      setApiOnline(false);
    }
  }, 2000);
  
  return () => clearInterval(interval);
}, [rodando]);
```

### Verificação de API ao Montar:
```typescript
useEffect(() => {
  const verificarAPI = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/health');
      const data = await response.json();
      setApiOnline(data.status === 'online');
    } catch (error) {
      setApiOnline(false);
    }
  };
  
  verificarAPI();
  const interval = setInterval(verificarAPI, 10000); // verifica a cada 10s
  
  return () => clearInterval(interval);
}, []);
```

## 🎨 DESIGN SUGERIDO

Use Tailwind CSS com:
- Card com sombra e bordas arredondadas
- Cores: azul para ações, verde para sucesso, vermelho para erro
- Ícones: use lucide-react (Play, Square, CheckCircle, XCircle, Activity)
- Animações suaves para transições de estado
- Responsivo e moderno

## 📍 ONDE ADICIONAR NO FLOW

Crie uma nova página ou seção chamada "Automação de Editais" e adicione o componente lá. Deve ser facilmente acessível no menu principal.

## ⚠️ OBSERVAÇÕES IMPORTANTES

1. A API roda em **localhost:5000** - não precisa de autenticação
2. CORS já está configurado na API
3. Caminhos de arquivo devem usar barras duplas: `C:\\Users\\...`
4. Polling deve parar quando automação terminar
5. Sempre verificar se API está online antes de tentar iniciar
6. Mostrar feedback claro para o usuário em todas as ações

## 🧪 TESTES A FAZER

Após criar o componente, teste:
1. ✅ Indicador mostra "API Offline" quando API não está rodando
2. ✅ Indicador mostra "API Online" quando API está rodando
3. ✅ Botão "Iniciar" fica desabilitado quando campo está vazio
4. ✅ Automação inicia corretamente com caminho válido
5. ✅ Status atualiza em tempo real durante execução
6. ✅ Botão "Parar" interrompe a automação
7. ✅ Estatísticas são exibidas corretamente
8. ✅ Mensagens de erro são claras e úteis

## 📦 EXEMPLO DE ESTRUTURA DO COMPONENTE

```typescript
import { useState, useEffect } from 'react';
import { Play, Square, Activity, CheckCircle, XCircle } from 'lucide-react';

export function AutomacaoControl() {
  // Estados
  const [caminhoPDF, setCaminhoPDF] = useState('');
  const [status, setStatus] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [mensagem, setMensagem] = useState('');
  
  // Funções
  const verificarAPI = async () => { /* ... */ };
  const iniciarAutomacao = async () => { /* ... */ };
  const pararAutomacao = async () => { /* ... */ };
  
  // Effects
  useEffect(() => { /* verificar API */ }, []);
  useEffect(() => { /* polling status */ }, [rodando]);
  
  // Render
  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Indicador de API */}
      {/* Campo de Input */}
      {/* Botões de Controle */}
      {/* Painel de Status */}
      {/* Área de Logs */}
    </div>
  );
}
```

---

## ✅ CHECKLIST FINAL

Ao terminar, o componente deve:
- [ ] Verificar status da API automaticamente
- [ ] Permitir iniciar automação com caminho do PDF
- [ ] Monitorar progresso em tempo real
- [ ] Exibir estatísticas (adicionados/pulados)
- [ ] Permitir parar automação
- [ ] Mostrar feedback claro em todas as ações
- [ ] Ter design moderno e responsivo
- [ ] Tratar todos os erros adequadamente

---

**Crie este componente completo e funcional, seguindo todas as especificações acima. Use as melhores práticas do React e TypeScript.**
