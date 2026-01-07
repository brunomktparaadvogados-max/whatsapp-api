# PROMPT PARA LOVABLE - INTEGRAÇÃO COM AUTOMAÇÃO PYTHON

## 📋 Copie e cole este prompt no Lovable:

---

Preciso adicionar uma nova funcionalidade no menu "Construtor de Lista" do sistema Flow.

**Objetivo:** Integrar com uma API Python local que executa automação de extração de dados de editais e cadastro automático de leads.

**Requisitos:**

1. **Adicionar nova seção no menu "Construtor de Lista":**
   - Título: "Automação de Edital"
   - Descrição: "Processar PDF de edital automaticamente via Mind-7"

2. **Campos necessários:**
   - Input de texto para caminho do PDF (placeholder: "C:\Users\...\edital.pdf")
   - Botão "Iniciar Automação" (azul, desabilitado quando rodando)
   - Botão "Parar Automação" (vermelho, desabilitado quando não está rodando)
   - Área de status mostrando:
     - Mensagem atual da automação
     - Contador de leads adicionados
     - Contador de leads pulados
     - Indicador visual de "rodando" (spinner/loading)

3. **Integração com API REST local:**

**Endpoint base:** `http://localhost:5000`

**Endpoints disponíveis:**

```typescript
// Verificar se API está online
GET http://localhost:5000/api/health
// Resposta: { status: "online", mensagem: "API de automação funcionando" }

// Obter status atual
GET http://localhost:5000/api/status
// Resposta: {
//   rodando: boolean,
//   progresso: number,
//   total: number,
//   mensagem: string,
//   adicionados: number,
//   pulados: number
// }

// Iniciar automação
POST http://localhost:5000/api/iniciar
// Body: { caminho_pdf: string }
// Resposta: { sucesso: boolean, mensagem: string }

// Parar automação
POST http://localhost:5000/api/parar
// Resposta: { sucesso: boolean, mensagem: string }
```

4. **Comportamento esperado:**

- Ao clicar em "Iniciar Automação":
  - Validar se o caminho do PDF foi preenchido
  - Fazer POST para `/api/iniciar` com o caminho do PDF
  - Iniciar polling a cada 2 segundos em `/api/status` para atualizar a interface
  - Desabilitar o botão "Iniciar" e habilitar o botão "Parar"
  - Mostrar spinner/loading

- Durante a execução:
  - Atualizar em tempo real: mensagem, adicionados e pulados
  - Permitir parar a automação clicando em "Parar"

- Ao finalizar (quando `rodando: false`):
  - Parar o polling
  - Habilitar novamente o botão "Iniciar"
  - Desabilitar o botão "Parar"
  - Remover spinner/loading
  - Mostrar mensagem de conclusão

5. **Tratamento de erros:**

- Se a API não estiver disponível, mostrar mensagem:
  "API de automação não está rodando. Execute: .\iniciar_api.ps1"

- Se o arquivo PDF não for encontrado, mostrar o erro retornado pela API

- Se já houver uma automação rodando, mostrar:
  "Já existe uma automação em execução"

6. **Design:**

- Usar os mesmos padrões visuais do sistema Flow
- Cards com bordas arredondadas
- Cores: azul para ações primárias, vermelho para parar, verde para sucesso
- Ícones apropriados (play, stop, check, etc)
- Feedback visual claro do status

7. **Exemplo de layout:**

```
┌─────────────────────────────────────────────┐
│  Automação de Edital                        │
│  Processar PDF automaticamente via Mind-7   │
├─────────────────────────────────────────────┤
│                                             │
│  Caminho do PDF:                            │
│  [C:\Users\...\edital.pdf              ]    │
│                                             │
│  [▶ Iniciar Automação] [⏹ Parar]           │
│                                             │
│  Status: Processando...  🔄                 │
│  Adicionados: 5                             │
│  Pulados: 2                                 │
│                                             │
└─────────────────────────────────────────────┘
```

8. **Código TypeScript/React sugerido:**

```typescript
const [caminhoPDF, setCaminhoPDF] = useState('');
const [rodando, setRodando] = useState(false);
const [status, setStatus] = useState({
  mensagem: 'Aguardando...',
  adicionados: 0,
  pulados: 0
});

const iniciarAutomacao = async () => {
  if (!caminhoPDF) {
    alert('Informe o caminho do PDF');
    return;
  }

  try {
    const response = await fetch('http://localhost:5000/api/iniciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caminho_pdf: caminhoPDF })
    });

    const data = await response.json();

    if (data.sucesso) {
      setRodando(true);
      monitorarStatus();
    } else {
      alert(data.mensagem);
    }
  } catch (error) {
    alert('API não está rodando. Execute: .\\iniciar_api.ps1');
  }
};

const monitorarStatus = () => {
  const interval = setInterval(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/status');
      const statusData = await response.json();

      setStatus({
        mensagem: statusData.mensagem,
        adicionados: statusData.adicionados,
        pulados: statusData.pulados
      });

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
  } catch (error) {
    alert('Erro ao parar automação');
  }
};
```

**Importante:**
- A API roda localmente (localhost) e deve estar ativa antes de usar
- O usuário precisa ter o Chrome em modo debug aberto e logado no Mind-7 e Flow
- A automação usa o navegador do próprio usuário (não abre novo navegador)

Por favor, implemente esta funcionalidade mantendo o padrão visual e de código do projeto.

---

## 📝 Instruções de uso:

1. Copie todo o texto acima (da linha "Preciso adicionar..." até "mantendo o padrão visual...")
2. Cole no chat do Lovable
3. O Lovable irá criar/atualizar os componentes necessários
4. Após a implementação, teste com a API rodando localmente

## ✅ Checklist pós-implementação:

- [ ] Componente criado no menu "Construtor de Lista"
- [ ] Campos de input e botões funcionando
- [ ] Integração com API testada
- [ ] Polling de status funcionando
- [ ] Tratamento de erros implementado
- [ ] Design consistente com o resto do sistema
- [ ] Feedback visual adequado (loading, cores, ícones)
