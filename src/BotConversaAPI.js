const axios = require('axios');

class BotConversaAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://backend.botconversa.com.br/api/v1/webhook';
  }

  headers() {
    return {
      'api-key': this.apiKey,
      'Content-Type': 'application/json'
    };
  }

  normalizePhone(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) digits = `55${digits}`;
    return digits;
  }

  async listFlows() {
    const response = await axios.get(`${this.baseUrl}/flows/`, { headers: this.headers(), timeout: 20000 });
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  }

  async getSubscriberByPhone(phone) {
    const normalized = this.normalizePhone(phone);
    try {
      const response = await axios.get(`${this.baseUrl}/subscriber/get_by_phone/${normalized}/`, {
        headers: this.headers(),
        timeout: 20000,
        validateStatus: () => true
      });
      if (response.status === 404) return null;
      if (response.status >= 400) {
        const error = new Error(response.data?.detail || response.data?.error || 'Falha ao consultar assinante BotConversa');
        error.status = response.status;
        error.details = response.data;
        throw error;
      }
      return response.data || null;
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }

  async createSubscriber(phone, firstName = '') {
    const normalized = this.normalizePhone(phone);
    const response = await axios.post(
      `${this.baseUrl}/subscriber/`,
      {
        phone: normalized,
        first_name: firstName || '',
        has_opt_in_whatsapp: true
      },
      { headers: this.headers(), timeout: 20000 }
    );
    return response.data;
  }

  async ensureSubscriber(phone, firstName = '') {
    const existing = await this.getSubscriberByPhone(phone);
    if (existing?.id) return existing;
    return await this.createSubscriber(phone, firstName);
  }

  async sendFlow({ phone, firstName = '', flowId }) {
    if (!flowId) {
      const error = new Error('flowId BotConversa nao configurado');
      error.status = 400;
      throw error;
    }
    const subscriber = await this.ensureSubscriber(phone, firstName);
    if (!subscriber?.id) {
      const error = new Error('BotConversa nao retornou ID do assinante');
      error.status = 502;
      throw error;
    }

    const response = await axios.post(
      `${this.baseUrl}/subscriber/${subscriber.id}/send_flow/`,
      { flow: flowId },
      { headers: this.headers(), timeout: 25000 }
    );

    return {
      subscriberId: subscriber.id,
      to: this.normalizePhone(phone),
      flowId,
      raw: response.data
    };
  }
}

module.exports = BotConversaAPI;
