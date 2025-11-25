const os = require('os');
const si = require('systeminformation');
const EventEmitter = require('events');

/**
 * Network Monitoring Service
 * Monitors network performance, bandwidth usage, and connection quality
 */

class NetworkMonitor extends EventEmitter {
  constructor() {
    super();
    
    this.enabled = process.env.ENABLE_NETWORK_MONITORING !== 'false';
    this.checkInterval = parseInt(process.env.NETWORK_CHECK_INTERVAL_MS) || 5000;
    this.warningThreshold = parseInt(process.env.BANDWIDTH_WARNING_THRESHOLD_MBPS) || 50;
    this.criticalThreshold = parseInt(process.env.BANDWIDTH_CRITICAL_THRESHOLD_MBPS) || 80;
    
    this.metrics = {
      bandwidth: {
        upload: 0,
        download: 0,
        total: 0
      },
      latency: 0,
      packetLoss: 0,
      connectionQuality: 'good', // good, fair, poor
      networkInterfaces: [],
      history: []
    };
    
    this.previousStats = null;
    this.monitoringInterval = null;
    this.maxHistoryLength = 100;
  }

  /**
   * Start network monitoring
   */
  start() {
    if (!this.enabled) {
      console.log('ℹ️  Network monitoring is disabled');
      return;
    }

    console.log('🌐 Starting network monitoring...');
    
    // Initial check
    this.checkNetwork();
    
    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.checkNetwork();
    }, this.checkInterval);
    
    console.log(`✅ Network monitoring started (interval: ${this.checkInterval}ms)`);
  }

  /**
   * Stop network monitoring
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('🛑 Network monitoring stopped');
    }
  }

  /**
   * Check network status
   */
  async checkNetwork() {
    try {
      // Get network stats
      const networkStats = await si.networkStats();
      const networkInterfaces = await si.networkInterfaces();
      
      // Calculate bandwidth
      if (this.previousStats && networkStats.length > 0) {
        const currentStats = networkStats[0];
        const timeDiff = (Date.now() - this.previousStats.timestamp) / 1000; // seconds
        
        // Calculate bytes per second
        const uploadBps = (currentStats.tx_bytes - this.previousStats.tx_bytes) / timeDiff;
        const downloadBps = (currentStats.rx_bytes - this.previousStats.rx_bytes) / timeDiff;
        
        // Convert to Mbps
        const uploadMbps = (uploadBps * 8) / (1024 * 1024);
        const downloadMbps = (downloadBps * 8) / (1024 * 1024);
        const totalMbps = uploadMbps + downloadMbps;
        
        this.metrics.bandwidth = {
          upload: Math.max(0, uploadMbps),
          download: Math.max(0, downloadMbps),
          total: Math.max(0, totalMbps)
        };
        
        // Determine connection quality
        this.updateConnectionQuality(totalMbps);
        
        // Add to history
        this.addToHistory({
          timestamp: Date.now(),
          upload: this.metrics.bandwidth.upload,
          download: this.metrics.bandwidth.download,
          total: this.metrics.bandwidth.total,
          quality: this.metrics.connectionQuality
        });
        
        // Emit events for thresholds
        this.checkThresholds(totalMbps);
      }
      
      // Update previous stats
      if (networkStats.length > 0) {
        this.previousStats = {
          ...networkStats[0],
          timestamp: Date.now()
        };
      }
      
      // Update network interfaces info
      this.metrics.networkInterfaces = networkInterfaces.map(iface => ({
        name: iface.iface,
        ip4: iface.ip4,
        ip6: iface.ip6,
        mac: iface.mac,
        type: iface.type,
        speed: iface.speed,
        operstate: iface.operstate
      }));
      
    } catch (error) {
      console.error('❌ Network monitoring error:', error.message);
      this.emit('error', error);
    }
  }

  /**
   * Update connection quality based on bandwidth
   */
  updateConnectionQuality(bandwidthMbps) {
    let quality = 'good';
    
    if (bandwidthMbps >= this.criticalThreshold) {
      quality = 'poor';
    } else if (bandwidthMbps >= this.warningThreshold) {
      quality = 'fair';
    }
    
    // Emit event if quality changed
    if (quality !== this.metrics.connectionQuality) {
      const previousQuality = this.metrics.connectionQuality;
      this.metrics.connectionQuality = quality;
      
      this.emit('qualityChange', {
        previous: previousQuality,
        current: quality,
        bandwidth: bandwidthMbps
      });
      
      console.log(`🌐 Network quality changed: ${previousQuality} → ${quality} (${bandwidthMbps.toFixed(2)} Mbps)`);
    } else {
      this.metrics.connectionQuality = quality;
    }
  }

  /**
   * Check bandwidth thresholds
   */
  checkThresholds(bandwidthMbps) {
    if (bandwidthMbps >= this.criticalThreshold) {
      this.emit('bandwidthCritical', {
        bandwidth: bandwidthMbps,
        threshold: this.criticalThreshold
      });
    } else if (bandwidthMbps >= this.warningThreshold) {
      this.emit('bandwidthWarning', {
        bandwidth: bandwidthMbps,
        threshold: this.warningThreshold
      });
    }
  }

  /**
   * Add metrics to history
   */
  addToHistory(data) {
    this.metrics.history.push(data);
    
    // Keep history limited
    if (this.metrics.history.length > this.maxHistoryLength) {
      this.metrics.history.shift();
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: Date.now(),
      enabled: this.enabled
    };
  }

  /**
   * Get bandwidth history
   */
  getHistory(limit = 50) {
    const history = this.metrics.history.slice(-limit);
    return history;
  }

  /**
   * Get network statistics summary
   */
  async getNetworkStats() {
    try {
      const [networkStats, networkInterfaces, networkConnections] = await Promise.all([
        si.networkStats(),
        si.networkInterfaces(),
        si.networkConnections()
      ]);

      return {
        stats: networkStats,
        interfaces: networkInterfaces,
        connections: networkConnections.length,
        activeConnections: networkConnections.filter(c => c.state === 'ESTABLISHED').length
      };
    } catch (error) {
      console.error('Error getting network stats:', error);
      return null;
    }
  }

  /**
   * Test network speed (simple ping-like test)
   */
  async testNetworkSpeed(url = 'https://www.google.com') {
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        cache: 'no-cache'
      });
      
      const latency = Date.now() - startTime;
      
      return {
        success: response.ok,
        latency,
        status: response.status
      };
    } catch (error) {
      return {
        success: false,
        latency: -1,
        error: error.message
      };
    }
  }

  /**
   * Get recommended bitrate based on current network conditions
   */
  getRecommendedBitrate() {
    const { total } = this.metrics.bandwidth;
    const quality = this.metrics.connectionQuality;
    
    // Conservative recommendations (use 70% of available bandwidth)
    const availableBandwidth = total * 0.7;
    
    let recommendedBitrate;
    
    if (quality === 'poor' || availableBandwidth < 2) {
      // Low quality: 500-1500 kbps
      recommendedBitrate = Math.min(1500, Math.max(500, availableBandwidth * 1000));
    } else if (quality === 'fair' || availableBandwidth < 5) {
      // Medium quality: 1500-3500 kbps
      recommendedBitrate = Math.min(3500, Math.max(1500, availableBandwidth * 1000));
    } else {
      // High quality: 3500-8000 kbps
      recommendedBitrate = Math.min(8000, Math.max(3500, availableBandwidth * 1000));
    }
    
    return {
      bitrate: Math.round(recommendedBitrate),
      quality,
      availableBandwidth: total,
      confidence: this.getConfidenceLevel()
    };
  }

  /**
   * Get confidence level for recommendations
   */
  getConfidenceLevel() {
    const historyLength = this.metrics.history.length;
    
    if (historyLength < 10) return 'low';
    if (historyLength < 30) return 'medium';
    return 'high';
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics.history = [];
    this.previousStats = null;
    console.log('🔄 Network metrics reset');
  }
}

// Export singleton instance
module.exports = new NetworkMonitor();
