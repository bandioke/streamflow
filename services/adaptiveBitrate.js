const EventEmitter = require('events');
const networkMonitor = require('./networkMonitor');

/**
 * Adaptive Bitrate Service
 * Automatically adjusts stream bitrate based on network conditions
 */

class AdaptiveBitrateService extends EventEmitter {
  constructor() {
    super();
    
    this.enabled = process.env.ENABLE_ADAPTIVE_BITRATE !== 'false';
    this.autoAdjust = process.env.AUTO_ADJUST_QUALITY !== 'false';
    this.minBitrate = parseInt(process.env.MIN_BITRATE_KBPS) || 500;
    this.maxBitrate = parseInt(process.env.MAX_BITRATE_KBPS) || 8000;
    
    // Bitrate presets
    this.presets = {
      '240p': { width: 426, height: 240, bitrate: 500, fps: 30 },
      '360p': { width: 640, height: 360, bitrate: 800, fps: 30 },
      '480p': { width: 854, height: 480, bitrate: 1500, fps: 30 },
      '720p': { width: 1280, height: 720, bitrate: 2500, fps: 30 },
      '720p60': { width: 1280, height: 720, bitrate: 4000, fps: 60 },
      '1080p': { width: 1920, height: 1080, bitrate: 5000, fps: 30 },
      '1080p60': { width: 1920, height: 1080, bitrate: 8000, fps: 60 }
    };
    
    // Active streams tracking
    this.activeStreams = new Map();
    
    // Adjustment settings
    this.adjustmentInterval = 10000; // Check every 10 seconds
    this.adjustmentThreshold = 0.2; // 20% change triggers adjustment
    
    this.setupNetworkMonitoring();
  }

  /**
   * Setup network monitoring listeners
   */
  setupNetworkMonitoring() {
    if (!this.enabled) {
      return;
    }

    // Listen to network quality changes
    networkMonitor.on('qualityChange', (data) => {
      console.log(`📊 Network quality changed: ${data.previous} → ${data.current}`);
      
      if (this.autoAdjust) {
        this.adjustAllStreams(data.current);
      }
    });

    // Listen to bandwidth warnings
    networkMonitor.on('bandwidthWarning', (data) => {
      console.log(`⚠️  Bandwidth warning: ${data.bandwidth.toFixed(2)} Mbps`);
      this.emit('bandwidthWarning', data);
    });

    // Listen to bandwidth critical
    networkMonitor.on('bandwidthCritical', (data) => {
      console.log(`🚨 Bandwidth critical: ${data.bandwidth.toFixed(2)} Mbps`);
      
      if (this.autoAdjust) {
        this.emergencyBitrateReduction();
      }
      
      this.emit('bandwidthCritical', data);
    });
  }

  /**
   * Register a stream for adaptive bitrate
   */
  registerStream(streamId, config) {
    const streamConfig = {
      id: streamId,
      currentBitrate: config.bitrate || 2500,
      targetBitrate: config.bitrate || 2500,
      resolution: config.resolution || '720p',
      fps: config.fps || 30,
      minBitrate: this.minBitrate,
      maxBitrate: this.maxBitrate,
      adjustmentHistory: [],
      lastAdjustment: null,
      status: 'active'
    };
    
    this.activeStreams.set(streamId, streamConfig);
    
    console.log(`📹 Stream ${streamId} registered for adaptive bitrate`);
    console.log(`   Initial bitrate: ${streamConfig.currentBitrate} kbps`);
    
    // Start monitoring this stream
    this.startStreamMonitoring(streamId);
    
    return streamConfig;
  }

  /**
   * Unregister a stream
   */
  unregisterStream(streamId) {
    if (this.activeStreams.has(streamId)) {
      this.activeStreams.delete(streamId);
      console.log(`📹 Stream ${streamId} unregistered from adaptive bitrate`);
    }
  }

  /**
   * Start monitoring a specific stream
   */
  startStreamMonitoring(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;

    // Set up periodic adjustment check
    stream.monitoringInterval = setInterval(() => {
      this.checkAndAdjustStream(streamId);
    }, this.adjustmentInterval);
  }

  /**
   * Check and adjust stream bitrate if needed
   */
  async checkAndAdjustStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream || !this.autoAdjust) return;

    try {
      // Get network recommendation
      const recommendation = networkMonitor.getRecommendedBitrate();
      
      // Calculate if adjustment is needed
      const currentBitrate = stream.currentBitrate;
      const recommendedBitrate = recommendation.bitrate;
      const difference = Math.abs(recommendedBitrate - currentBitrate) / currentBitrate;
      
      // Only adjust if difference is significant
      if (difference > this.adjustmentThreshold) {
        const newBitrate = this.calculateNewBitrate(currentBitrate, recommendedBitrate);
        
        if (newBitrate !== currentBitrate) {
          await this.adjustStreamBitrate(streamId, newBitrate, recommendation.quality);
        }
      }
    } catch (error) {
      console.error(`Error adjusting stream ${streamId}:`, error.message);
    }
  }

  /**
   * Calculate new bitrate with smoothing
   */
  calculateNewBitrate(current, recommended) {
    // Smooth transition (move 50% towards recommended)
    const newBitrate = current + (recommended - current) * 0.5;
    
    // Clamp to min/max
    return Math.round(Math.max(this.minBitrate, Math.min(this.maxBitrate, newBitrate)));
  }

  /**
   * Adjust stream bitrate
   */
  async adjustStreamBitrate(streamId, newBitrate, quality) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;

    const oldBitrate = stream.currentBitrate;
    stream.currentBitrate = newBitrate;
    stream.targetBitrate = newBitrate;
    stream.lastAdjustment = {
      timestamp: Date.now(),
      oldBitrate,
      newBitrate,
      quality,
      reason: 'network_conditions'
    };
    
    // Add to history
    stream.adjustmentHistory.push(stream.lastAdjustment);
    
    // Keep history limited
    if (stream.adjustmentHistory.length > 50) {
      stream.adjustmentHistory.shift();
    }
    
    // Emit adjustment event
    this.emit('bitrateAdjusted', {
      streamId,
      oldBitrate,
      newBitrate,
      quality,
      change: newBitrate - oldBitrate
    });
    
    console.log(`📊 Stream ${streamId} bitrate adjusted: ${oldBitrate} → ${newBitrate} kbps (${quality})`);
    
    return stream;
  }

  /**
   * Emergency bitrate reduction for all streams
   */
  emergencyBitrateReduction() {
    console.log('🚨 Emergency bitrate reduction for all streams');
    
    this.activeStreams.forEach((stream, streamId) => {
      // Reduce to minimum safe bitrate
      const emergencyBitrate = Math.max(this.minBitrate, stream.currentBitrate * 0.5);
      this.adjustStreamBitrate(streamId, emergencyBitrate, 'poor');
    });
  }

  /**
   * Adjust all streams based on network quality
   */
  adjustAllStreams(quality) {
    console.log(`📊 Adjusting all streams for ${quality} network quality`);
    
    this.activeStreams.forEach((stream, streamId) => {
      const recommendation = networkMonitor.getRecommendedBitrate();
      const newBitrate = this.calculateNewBitrate(stream.currentBitrate, recommendation.bitrate);
      
      if (newBitrate !== stream.currentBitrate) {
        this.adjustStreamBitrate(streamId, newBitrate, quality);
      }
    });
  }

  /**
   * Get optimal preset based on network conditions
   */
  getOptimalPreset() {
    const recommendation = networkMonitor.getRecommendedBitrate();
    const targetBitrate = recommendation.bitrate;
    
    // Find closest preset
    let optimalPreset = '480p';
    let minDiff = Infinity;
    
    for (const [name, preset] of Object.entries(this.presets)) {
      const diff = Math.abs(preset.bitrate - targetBitrate);
      if (diff < minDiff) {
        minDiff = diff;
        optimalPreset = name;
      }
    }
    
    return {
      preset: optimalPreset,
      ...this.presets[optimalPreset],
      networkQuality: recommendation.quality,
      confidence: recommendation.confidence
    };
  }

  /**
   * Get preset configuration
   */
  getPreset(name) {
    return this.presets[name] || this.presets['720p'];
  }

  /**
   * Get all presets
   */
  getAllPresets() {
    return { ...this.presets };
  }

  /**
   * Get stream configuration
   */
  getStreamConfig(streamId) {
    return this.activeStreams.get(streamId);
  }

  /**
   * Get all active streams
   */
  getActiveStreams() {
    return Array.from(this.activeStreams.values());
  }

  /**
   * Get adjustment history for a stream
   */
  getAdjustmentHistory(streamId, limit = 20) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return [];
    
    return stream.adjustmentHistory.slice(-limit);
  }

  /**
   * Manual bitrate adjustment
   */
  manualAdjustment(streamId, bitrate) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    // Validate bitrate
    if (bitrate < this.minBitrate || bitrate > this.maxBitrate) {
      throw new Error(`Bitrate must be between ${this.minBitrate} and ${this.maxBitrate} kbps`);
    }

    const oldBitrate = stream.currentBitrate;
    stream.currentBitrate = bitrate;
    stream.targetBitrate = bitrate;
    stream.lastAdjustment = {
      timestamp: Date.now(),
      oldBitrate,
      newBitrate: bitrate,
      reason: 'manual'
    };
    
    stream.adjustmentHistory.push(stream.lastAdjustment);
    
    this.emit('bitrateAdjusted', {
      streamId,
      oldBitrate,
      newBitrate: bitrate,
      manual: true
    });
    
    console.log(`📊 Stream ${streamId} bitrate manually adjusted: ${oldBitrate} → ${bitrate} kbps`);
    
    return stream;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      autoAdjust: this.autoAdjust,
      minBitrate: this.minBitrate,
      maxBitrate: this.maxBitrate,
      activeStreams: this.activeStreams.size,
      networkQuality: networkMonitor.getMetrics().connectionQuality,
      recommendedBitrate: networkMonitor.getRecommendedBitrate()
    };
  }

  /**
   * Stop monitoring all streams
   */
  stopAll() {
    this.activeStreams.forEach((stream) => {
      if (stream.monitoringInterval) {
        clearInterval(stream.monitoringInterval);
      }
    });
    
    this.activeStreams.clear();
    console.log('🛑 Adaptive bitrate service stopped for all streams');
  }
}

// Export singleton instance
module.exports = new AdaptiveBitrateService();
