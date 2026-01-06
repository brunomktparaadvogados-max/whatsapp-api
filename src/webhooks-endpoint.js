// Endpoint para obter URLs de webhook do usuário (para configurar no n8n/Flow)
app.get('/api/webhooks/info', authMiddleware, async (req, res) => {
  try {
    const userSessions = await db.getSessionsByUserId(req.userId);
    
    if (userSessions.length === 0) {
      return res.status(404).json({
        error: 'Nenhuma sessão encontrada. Crie uma sessão primeiro.',
        action: 'create_session'
      });
    }

    const baseUrl = process.env.API_URL || `http://${HOST}:${PORT}`;
    
    const webhooksInfo = userSessions.map(session => ({
      sessionId: session.id,
      status: session.status,
      webhooks: {
        // Webhook para ENVIAR mensagens (usar no n8n/Flow para enviar)
        send: {
          url: `${baseUrl}/api/sessions/${session.id}/message`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer SEU_TOKEN_JWT'
          },
          body: {
            to: '5511999999999',
            message: 'Sua mensagem aqui'
          },
          description: 'Use este endpoint para ENVIAR mensagens via WhatsApp'
        },
        // Webhook para RECEBER mensagens (configurar no Flow para receber notificações)
        receive: {
          url: session.webhook_url || 'Não configurado',
          method: 'POST',
          description: 'Configure este webhook no Flow para RECEBER mensagens do WhatsApp',
          howToSet: `PUT ${baseUrl}/api/sessions/${session.id}/webhook`,
          examplePayload: {
            event: 'message',
            sessionId: session.id,
            userId: req.userId,
            message: {
              id: 'msg_id',
              from: '5511999999999',
              body: 'Mensagem recebida',
              type: 'chat',
              timestamp: 1234567890
            }
          }
        }
      }
    }));

    res.json({
      success: true,
      userId: req.userId,
      totalSessions: userSessions.length,
      webhooks: webhooksInfo,
      instructions: {
        send: 'Use o webhook "send" no n8n/Flow para ENVIAR mensagens',
        receive: 'Configure o webhook "receive" para RECEBER mensagens no Flow',
        authentication: 'Inclua o header Authorization: Bearer SEU_TOKEN em todas as requisições'
      }
    });
  } catch (error) {
    console.error('Erro ao obter webhooks:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

