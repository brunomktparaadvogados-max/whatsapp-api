from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import os
from automacao_flow_integrada import conectar_navegador_existente, processar_edital_automatico

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": ["*"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

status_automacao = {
    "rodando": False,
    "progresso": 0,
    "total": 0,
    "mensagem": "Aguardando comando",
    "adicionados": 0,
    "pulados": 0
}

def executar_automacao(caminho_pdf):
    global status_automacao
    
    try:
        status_automacao["rodando"] = True
        status_automacao["mensagem"] = "Conectando ao navegador..."
        
        driver = conectar_navegador_existente()
        
        if not driver:
            status_automacao["rodando"] = False
            status_automacao["mensagem"] = "Erro: Navegador não conectado"
            return
        
        status_automacao["mensagem"] = "Processando edital..."
        processar_edital_automatico(driver, caminho_pdf)
        
        status_automacao["rodando"] = False
        status_automacao["mensagem"] = "Automação concluída!"
        
    except Exception as e:
        status_automacao["rodando"] = False
        status_automacao["mensagem"] = f"Erro: {str(e)}"

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify(status_automacao)

@app.route('/api/iniciar', methods=['POST'])
def iniciar_automacao():
    global status_automacao
    
    if status_automacao["rodando"]:
        return jsonify({
            "sucesso": False,
            "mensagem": "Automação já está rodando"
        }), 400
    
    data = request.json
    caminho_pdf = data.get('caminho_pdf')
    
    if not caminho_pdf:
        return jsonify({
            "sucesso": False,
            "mensagem": "Caminho do PDF não fornecido"
        }), 400
    
    if not os.path.exists(caminho_pdf):
        return jsonify({
            "sucesso": False,
            "mensagem": f"Arquivo não encontrado: {caminho_pdf}"
        }), 404
    
    status_automacao = {
        "rodando": True,
        "progresso": 0,
        "total": 0,
        "mensagem": "Iniciando automação...",
        "adicionados": 0,
        "pulados": 0
    }
    
    thread = threading.Thread(target=executar_automacao, args=(caminho_pdf,))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        "sucesso": True,
        "mensagem": "Automação iniciada com sucesso"
    })

@app.route('/api/parar', methods=['POST'])
def parar_automacao():
    global status_automacao
    
    if not status_automacao["rodando"]:
        return jsonify({
            "sucesso": False,
            "mensagem": "Nenhuma automação rodando"
        }), 400
    
    status_automacao["rodando"] = False
    status_automacao["mensagem"] = "Automação interrompida pelo usuário"
    
    return jsonify({
        "sucesso": True,
        "mensagem": "Automação parada"
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "online",
        "mensagem": "API de automação funcionando"
    })

if __name__ == '__main__':
    print("="*60)
    print("API DE AUTOMAÇÃO - FLOW + PYTHON")
    print("="*60)
    print("\nServidor rodando em: http://localhost:5000")
    print("\nEndpoints disponíveis:")
    print("  GET  /api/health  - Verificar se API está online")
    print("  GET  /api/status  - Status da automação")
    print("  POST /api/iniciar - Iniciar automação")
    print("  POST /api/parar   - Parar automação")
    print("\nPressione Ctrl+C para parar o servidor")
    print("="*60)
    
    app.run(host='0.0.0.0', port=5000, debug=False)
