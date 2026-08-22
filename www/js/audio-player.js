/**
 * audio-player.js - Plays 24kHz 16-bit PCM audio chunks from Gemini Live API
 * with instant Barge-in (stop and flush) support.
 */

class AudioPlayer {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 24000;
    this.onVolumeChange = options.onVolumeChange || (() => {});
    this.onPlaybackEnded = options.onPlaybackEnded || (() => {});
    
    this.audioContext = null;
    this.analyserNode = null;
    this.gainNode = null;
    this.nextPlayTime = 0;
    this.activeSources = new Set();
    this.isPlaying = false;
    this.animFrameId = null;
  }

  async initAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: this.sampleRate });
      
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.7;

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioContext.destination);

      this.startVolumeMonitoring();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async playChunkBase64(base64Data) {
    try {
      await this.initAudioContext();
      const pcm16 = this.base64ToInt16Array(base64Data);
      const float32 = this.int16ToFloat32(pcm16);

      const audioBuffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      const now = this.audioContext.currentTime;
      // Schedule seamless continuous playback
      const startTime = Math.max(now, this.nextPlayTime);
      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;

      this.activeSources.add(source);
      this.isPlaying = true;

      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0 && this.audioContext && this.audioContext.currentTime >= this.nextPlayTime - 0.05) {
          this.isPlaying = false;
          this.onPlaybackEnded();
        }
      };
    } catch (err) {
      console.error('AudioPlayer playChunk error:', err);
    }
  }

  /**
   * CRITICAL BARGE-IN FEATURE:
   * Instantly stops all currently playing and queued audio sources,
   * resets the timeline, and flushes buffers.
   */
  stopAndFlush() {
    console.log('⚡ Barge-in triggered: Stopping all active audio playback');
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source may have already finished
      }
    }
    this.activeSources.clear();

    if (this.audioContext) {
      this.nextPlayTime = this.audioContext.currentTime;
    }
    this.isPlaying = false;
    this.onVolumeChange(0);
    this.onPlaybackEnded();
  }

  startVolumeMonitoring() {
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    const update = () => {
      if (this.analyserNode) {
        this.analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = this.isPlaying ? Math.min(1.0, avg / 100) : 0;
        this.onVolumeChange(normalized);
      }
      this.animFrameId = requestAnimationFrame(update);
    };
    update();
  }

  base64ToInt16Array(base64) {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  int16ToFloat32(int16) {
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] < 0 ? int16[i] / 0x8000 : int16[i] / 0x7FFF;
    }
    return float32;
  }

  close() {
    this.stopAndFlush();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

window.AudioPlayer = AudioPlayer;
