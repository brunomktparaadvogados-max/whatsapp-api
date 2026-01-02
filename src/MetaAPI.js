const axios = require('axios');

class MetaWhatsAppAPI {
  constructor(accessToken, phoneNumberId) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.baseUrl = 'https://graph.facebook.com/v18.0';
  }

  async sendMessage(to, message) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: message }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Erro ao enviar mensagem via Meta API:', error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async sendTemplate(to, templateName, languageCode = 'pt_BR', components = []) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components: components
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Erro ao enviar template via Meta API:', error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async sendMedia(to, mediaType, mediaUrl, caption = '') {
    try {
      const mediaObject = {
        link: mediaUrl
      };
      
      if (caption && (mediaType === 'image' || mediaType === 'video')) {
        mediaObject.caption = caption;
      }

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: mediaType,
          [mediaType]: mediaObject
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Erro ao enviar mídia via Meta API:', error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async sendBulkMessages(contacts, message, delayMs = 1000) {
    const results = [];
    
    for (const contact of contacts) {
      const result = await this.sendMessage(contact, message);
      results.push({ contact, ...result });
      
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return results;
  }

  async markAsRead(messageId) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data || error.message };
    }
  }
}

module.exports = MetaWhatsAppAPI;
