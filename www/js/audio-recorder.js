/**
 * audio-recorder.js - Captures mic audio and converts to 16kHz 16-bit Mono PCM
 * for Gemini Live API WebSocket stream.
 */

class AudioRecorder {
  constructor(options = {}) {
    this.targetSampleRate = options.targetSampleRate || 16000;
    this.bufferSize = options.bufferSize || 2048;
    this.onAudioChunk = options.onAudioChunk || (() => {});
    this.onVolumeChange = options.onVolumeChange || (() => {});
    
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.analyserNode = null;
    this.isRecording = false;
    this.animFrameId = null;
  }

  async start() {
    if (this.isRecording) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Analyser for UI Visualizer
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.sourceNode.connect(this.analyserNode);

      // ScriptProcessor for real-time PCM chunk downsampling
      this.processorNode = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
      
      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const inputSampleRate = this.audioContext.sampleRate;
        
        // Resample to 16000 Hz
        const downsampled = this.downsampleBuffer(inputData, inputSampleRate, this.targetSampleRate);
        const pcm16 = this.floatTo16BitPCM(downsampled);
        
        // Convert to Base64
        const base64Chunk = this.arrayBufferToBase64(pcm16.buffer);
        this.onAudioChunk(base64Chunk);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isRecording = true;
      this.startVolumeMonitoring();
      console.log('AudioRecorder started, input sample rate:', this.audioContext.sampleRate, 'target:', this.targetSampleRate);
      return true;
    } catch (err) {
      console.error('Failed to start AudioRecorder:', err);
      this.stop();
      throw err;
    }
  }

  stop() {
    this.isRecording = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.onVolumeChange(0);
    console.log('AudioRecorder stopped');
  }

  startVolumeMonitoring() {
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    const update = () => {
      if (!this.isRecording || !this.analyserNode) return;
      this.analyserNode.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const normalized = Math.min(1.0, avg / 128);
      this.onVolumeChange(normalized);

      this.animFrameId = requestAnimationFrame(update);
    };
    update();
  }

  downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
      return buffer;
    }
    if (inputSampleRate < outputSampleRate) {
      return buffer;
    }
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

window.AudioRecorder = AudioRecorder;
