# DOCUMENTAÇÃO ATUALIZADA - ETAPA 4 ADICIONADA

## 🆕 NOVA FUNCIONALIDADE: ETAPA 4 - CADASTRO NO SISTEMA FLOW

### **Como Usar a Etapa 4**

1. **Pré-requisitos:**
   - Chrome em modo debug (porta 9222)
   - Sistema Flow aberto e logado em: https://sistemaflow.lovable.app
   - Flow deve estar na ÚLTIMA aba do navegador
   - Etapa 3 já executada (CPFs processados)

2. **Executar o script:**
```powershell
python C:\Users\55119\Desktop\processar_abas_cpf_exportar_flow.py
```

3. **Escolher opção 4:**
```
ESCOLHA UMA OPÇÃO:
1 - Processar novo PDF (extração + pesquisa)
2 - Continuar processamento pendente
3 - Processar abas já abertas no Chrome (extrair CPFs)
4 - Cadastrar leads válidos no sistema Flow

Digite a opção (1/2/3/4): 4
```

4. **Confirmar login no Flow:**
```
O Flow está logado na última aba? (s/n): s
```

### **O que a Etapa 4 faz:**

1. ✅ Busca apenas CPFs válidos do banco de dados (descarta múltiplos resultados)
2. ✅ Verifica se o Flow está logado na última aba
3. ✅ Cadastra cada lead automaticamente:
   - Clica no menu "WhatsApp"
   - Clica em "Adicionar"
   - Preenche os campos:
     * Nome: Nome completo do lead
     * Telefone: 5511999999999 (padrão)
     * Nº Processo: Número do processo
     * Informações do Big Data: CPF, RENACH, Processo, URL Mind7

### **Regras Importantes:**

- ⚠️ **Descarta automaticamente** leads com múltiplos resultados (mantém a regra da Etapa 3)
- ⚠️ **Cadastra apenas** leads com CPF único encontrado
- ⚠️ **Não altera** nenhuma funcionalidade existente (Etapas 1, 2 e 3 continuam iguais)

### **Exemplo de Saída:**

```
📋 CADASTRO DE LEADS NO SISTEMA FLOW
======================================================================

✓ 15 leads válidos encontrados

⚠️  IMPORTANTE:
   1. Abra o Chrome em modo debug (porta 9222)
   2. Acesse: https://sistemaflow.lovable.app
   3. Faça o LOGIN no sistema Flow
   4. Deixe a aba do Flow como a ÚLTIMA aba aberta

O Flow está logado na última aba? (s/n): s
✓ Conectado ao Chrome com Selenium
✓ Sistema Flow detectado na última aba

Iniciando cadastro de 15 leads...

[  1/ 15] Cadastrando: JOÃO DA SILVA... ✓
[  2/ 15] Cadastrando: MARIA SANTOS... ✓
[  3/ 15] Cadastrando: PEDRO OLIVEIRA... ✓
...

======================================================================
✅ CADASTRO CONCLUÍDO!
======================================================================
   • 15 leads cadastrados com sucesso
   • 0 erros durante o cadastro
   • Total processado: 15
```

### **Fluxo Completo Atualizado:**

```
ETAPA 1: Processar novo PDF
    ↓
ETAPA 2: Continuar processamento pendente (se necessário)
    ↓
ETAPA 3: Processar abas abertas (extrair CPFs)
    ↓
ETAPA 4: Cadastrar leads válidos no Flow ← NOVA!
```

### **Consulta SQL para Ver Leads Válidos:**

```sql
SELECT 
    nome_completo,
    cpf_encontrado,
    numero_processo,
    renach
FROM nomes_processados
WHERE status = 'processado'
  AND cpf_encontrado IS NOT NULL
  AND cpf_encontrado NOT LIKE '%resultados%'
  AND cpf_encontrado != 'Não encontrado'
  AND cpf_encontrado != 'Erro'
ORDER BY ordem;
```

### **Troubleshooting:**

**Erro: "Nenhum CPF válido encontrado"**
- Execute primeiro a Etapa 3 para processar as abas

**Erro: "A última aba não é o sistema Flow"**
- Abra o Flow em: https://sistemaflow.lovable.app
- Faça o login
- Certifique-se de que é a última aba aberta

**Erro: "Menu WhatsApp não encontrado"**
- Verifique se está logado no Flow
- Aguarde a página carregar completamente
- Tente novamente

---

**Versão**: 2.0 (com Etapa 4 - Cadastro no Flow)
**Data**: 2024
**Compatibilidade**: Mantém 100% de compatibilidade com versão anterior
