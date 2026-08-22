/**
 * live-client.js - Manages the WebSocket connection to Gemini Multimodal Live API
 * Handles bidirectional streaming, Barge-in interruption detection, and Function Calling.
 */

class GeminiLiveClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.model = options.model || 'models/gemini-2.0-flash-exp';
    this.voiceName = options.voiceName || 'Aoede'; // Aoede, Puck, Charon, Kore, Fenrir
    this.systemPrompt = options.systemPrompt || (
      "You are a helpful, warm, and highly capable live voice assistant for an Android app. " +
      "You can manage the user's to-do list, reminders, and write notes. " +
      "When the user asks you to add, list, complete, or delete tasks, or write down notes, always use the provided tools immediately. " +
      "Keep spoken responses concise, conversational, friendly, and natural."
    );

    this.audioRecorder = options.audioRecorder;
    this.audioPlayer = options.audioPlayer;
    this.toolsExecutor = options.toolsExecutor || new GeminiToolsExecutor(window.todoStore);

    // Callbacks for UI updates
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onInterrupted = options.onInterrupted || (() => {});
    this.onError = options.onError || (() => {});

    this.ws = null;
    this.isConnected = false;
    this.isSessionReady = false;
    this.status = 'idle'; // 'idle', 'connecting', 'connected', 'listening', 'speaking', 'interrupted', 'error'
  }

  setStatus(newStatus, detail = '') {
    this.status = newStatus;
    console.log(`[GeminiLiveClient] Status: ${newStatus} ${detail ? '(' + detail + ')' : ''}`);
    this.onStatusChange(newStatus, detail);
  }

  async connect() {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error('Gemini API key is required. Please set it in Settings.');
    }

    if (this.isConnected) {
      await this.disconnect();
    }

    this.setStatus('connecting', 'Establishing secure WebSocket connection...');

    const host = 'generativelanguage.googleapis.com';
    const path = `/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(this.apiKey.trim())}`;
    const url = `wss://${host}${path}`;

    if (window.logDiag) window.logDiag(`Connecting to URL: wss://${host}/ws/... (Key length: ${this.apiKey.trim().length})`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = async () => {
          console.log('✅ WebSocket connected to Gemini Live API');
          if (window.logDiag) window.logDiag(`✅ WebSocket Connection Opened successfully!`);
          this.isConnected = true;
          this.sendSetupMessage();

          // Initialize audio subsystems
          try {
            if (this.audioPlayer) {
              if (window.logDiag) window.logDiag(`Resuming audio player context...`);
              await this.audioPlayer.initAudioContext();
            }

            if (this.audioRecorder) {
              if (window.logDiag) window.logDiag(`Starting audio recorder microphone...`);
              this.audioRecorder.onAudioChunk = (base64PCM) => {
                this.sendRealtimeAudio(base64PCM);
              };
              await this.audioRecorder.start();
            }

            this.setStatus('listening', 'Connected! Speak to the assistant.');
            resolve(true);
          } catch (audioErr) {
            console.error('Audio initialization error:', audioErr);
            if (window.logDiag) window.logDiag(`❌ Audio Setup Error: ${audioErr.message || audioErr}`);
            this.setStatus('error', 'Microphone permission denied or audio failed');
            this.disconnect();
            reject(audioErr);
          }
        };

        this.ws.onmessage = async (event) => {
          try {
            let data;
            if (event.data instanceof Blob) {
              const text = await event.data.text();
              data = JSON.parse(text);
            } else {
              data = JSON.parse(event.data);
            }
            if (window.logDiag) {
              const keys = Object.keys(data);
              // avoid logging continuous voice stream data to reduce visual clutter
              if (!data.serverContent || data.serverContent.modelTurn) {
                window.logDiag(`📥 Message from server: { ${keys.join(', ')} }`);
              }
            }
            await this.handleServerMessage(data);
          } catch (e) {
            console.error('Error handling WebSocket message:', e, event.data);
            if (window.logDiag) window.logDiag(`❌ Message Parse Error: ${e.message}`);
          }
        };

        this.ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          if (window.logDiag) window.logDiag(`❌ WebSocket Error: connection failed. Check your API key and Internet connection.`);
          this.setStatus('error', 'Connection error occurred');
          this.onError(event);
          reject(new Error('WebSocket connection error'));
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          if (window.logDiag) window.logDiag(`🔌 WebSocket Closed. Code: ${event.code}, Reason: ${event.reason || 'None'}`);
          this.cleanup();
          this.setStatus('idle', 'Disconnected');
        };
      } catch (err) {
        if (window.logDiag) window.logDiag(`❌ Connection Block Error: ${err.message}`);
        this.cleanup();
        this.setStatus('error', err.message);
        reject(err);
      }
    });
  }

  sendSetupMessage() {
    const setupMsg = {
      setup: {
        model: this.model,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voiceName
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: this.systemPrompt }]
        },
        tools: this.toolsExecutor.getToolsDeclaration()
      }
    };

    console.log('📤 Sending Setup Handshake to Gemini Live:', setupMsg);
    if (window.logDiag) window.logDiag(`📤 Sending setup handshake... Model: ${this.model}, Voice: ${this.voiceName}`);
    this.ws.send(JSON.stringify(setupMsg));
  }

  sendRealtimeAudio(base64Chunk) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (!this.audioChunkCount) this.audioChunkCount = 0;
    this.audioChunkCount++;
    if (this.audioChunkCount === 1) {
      if (window.logDiag) window.logDiag(`🎙️ Started sending real-time audio input stream...`);
    } else if (this.audioChunkCount % 100 === 0) {
      if (window.logDiag) window.logDiag(`🎙️ Sent ${this.audioChunkCount} audio chunks.`);
    }

    const audioMsg = {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Chunk
        }
      }
    };

    this.ws.send(JSON.stringify(audioMsg));
  }

  sendTextMessage(text) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const textMsg = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text: text }]
          }
        ],
        turnComplete: true
      }
    };

    console.log('📤 Sending user text message:', text);
    this.ws.send(JSON.stringify(textMsg));
    this.onTranscript({ role: 'user', text: text, isFinal: true });
  }

  async handleServerMessage(message) {
    // 1. Setup complete response
    if (message.setupComplete) {
      console.log('🎉 Gemini Live Session Setup Complete!');
      this.isSessionReady = true;
      return;
    }

    // 2. Server Content (Audio / Text / Interruption)
    if (message.serverContent) {
      const { modelTurn, interrupted, turnComplete } = message.serverContent;

      // ⚡ CRITICAL BARGE-IN EVENT FROM GEMINI SERVER
      if (interrupted) {
        console.log('⚡ Server signal: User interrupted (Barge-in)! Cutting audio.');
        if (this.audioPlayer) {
          this.audioPlayer.stopAndFlush();
        }
        this.setStatus('interrupted', 'Barge-in: listening to you...');
        this.onInterrupted();
        return;
      }

      if (modelTurn && modelTurn.parts) {
        this.setStatus('speaking', 'AI is speaking');

        for (const part of modelTurn.parts) {
          // Audio Part
          if (part.inlineData && part.inlineData.data) {
            if (this.audioPlayer) {
              this.audioPlayer.playChunkBase64(part.inlineData.data);
            }
          }
          // Text Part / Transcript
          if (part.text) {
            this.onTranscript({ role: 'assistant', text: part.text, isFinal: false });
          }
        }
      }

      if (turnComplete) {
        this.setStatus('listening', 'Listening...');
      }
    }

    // 3. Tool Calls (Function Calling)
    if (message.toolCall && message.toolCall.functionCalls) {
      console.log('🛠️ Received Tool Call(s):', message.toolCall.functionCalls);
      this.setStatus('thinking', 'Executing action...');

      const functionResponses = [];

      for (const call of message.toolCall.functionCalls) {
        const output = await this.toolsExecutor.executeTool(call.name, call.args);
        functionResponses.push({
          response: { output: output },
          id: call.id
        });
      }

      const toolResponseMsg = {
        toolResponse: {
          functionResponses: functionResponses
        }
      };

      console.log('📤 Sending Tool Response back to Gemini:', toolResponseMsg);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(toolResponseMsg));
      }
    }
  }

  async disconnect() {
    this.cleanup();
    this.setStatus('idle', 'Disconnected');
  }

  cleanup() {
    this.isConnected = false;
    this.isSessionReady = false;
    this.audioChunkCount = 0;

    if (this.audioRecorder) {
      this.audioRecorder.stop();
    }

    if (this.audioPlayer) {
      this.audioPlayer.stopAndFlush();
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}

window.GeminiLiveClient = GeminiLiveClient;
