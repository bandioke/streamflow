const { db } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Analytics Service
 * Tracks and analyzes streaming metrics, viewer data, and performance
 */

class AnalyticsService {
  constructor() {
    this.enabled = process.env.ENABLE_ANALYTICS !== 'false';
    this.retentionDays = parseInt(process.env.ANALYTICS_RETENTION_DAYS) || 90;
    
    // In-memory cache for real-time metrics
    this.realtimeMetrics = new Map();
    
    this.initializeDatabase();
  }

  /**
   * Initialize analytics database tables
   */
  initializeDatabase() {
    // Stream analytics table
    db.run(`CREATE TABLE IF NOT EXISTS stream_analytics (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      user_id TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      -- Stream metrics
      duration_seconds INTEGER,
      bitrate_avg INTEGER,
      bitrate_min INTEGER,
      bitrate_max INTEGER,
      resolution TEXT,
      fps INTEGER,
      
      -- Performance metrics
      dropped_frames INTEGER DEFAULT 0,
      encoding_lag_ms INTEGER DEFAULT 0,
      network_quality TEXT,
      
      -- Bandwidth metrics
      bandwidth_upload_mbps REAL,
      bandwidth_download_mbps REAL,
      bandwidth_total_mbps REAL,
      
      -- Status
      status TEXT,
      error_count INTEGER DEFAULT 0,
      
      FOREIGN KEY (stream_id) REFERENCES streams(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating stream_analytics table:', err);
    });

    // Viewer analytics table (for future use)
    db.run(`CREATE TABLE IF NOT EXISTS viewer_analytics (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      -- Viewer metrics
      concurrent_viewers INTEGER DEFAULT 0,
      peak_viewers INTEGER DEFAULT 0,
      total_views INTEGER DEFAULT 0,
      unique_viewers INTEGER DEFAULT 0,
      
      -- Engagement metrics
      average_watch_time_seconds INTEGER,
      chat_messages INTEGER DEFAULT 0,
      
      FOREIGN KEY (stream_id) REFERENCES streams(id)
    )`, (err) => {
      if (err) console.error('Error creating viewer_analytics table:', err);
    });

    // System analytics table
    db.run(`CREATE TABLE IF NOT EXISTS system_analytics (
      id TEXT PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      -- System metrics
      cpu_usage REAL,
      memory_usage REAL,
      disk_usage REAL,
      
      -- Network metrics
      network_upload_mbps REAL,
      network_download_mbps REAL,
      
      -- Application metrics
      active_streams INTEGER DEFAULT 0,
      total_bandwidth_mbps REAL,
      
      -- Performance
      avg_response_time_ms INTEGER,
      error_rate REAL
    )`, (err) => {
      if (err) console.error('Error creating system_analytics table:', err);
    });

    // Create indexes for better query performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_stream_analytics_stream_id ON stream_analytics(stream_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_stream_analytics_timestamp ON stream_analytics(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_viewer_analytics_stream_id ON viewer_analytics(stream_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_system_analytics_timestamp ON system_analytics(timestamp)`);

    console.log('✅ Analytics database initialized');
  }

  /**
   * Record stream analytics
   */
  recordStreamAnalytics(data) {
    if (!this.enabled) return;

    const id = uuidv4();
    
    const sql = `INSERT INTO stream_analytics (
      id, stream_id, user_id, duration_seconds,
      bitrate_avg, bitrate_min, bitrate_max, resolution, fps,
      dropped_frames, encoding_lag_ms, network_quality,
      bandwidth_upload_mbps, bandwidth_download_mbps, bandwidth_total_mbps,
      status, error_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      id,
      data.stream_id,
      data.user_id || null,
      data.duration_seconds || 0,
      data.bitrate_avg || 0,
      data.bitrate_min || 0,
      data.bitrate_max || 0,
      data.resolution || '',
      data.fps || 0,
      data.dropped_frames || 0,
      data.encoding_lag_ms || 0,
      data.network_quality || 'unknown',
      data.bandwidth_upload_mbps || 0,
      data.bandwidth_download_mbps || 0,
      data.bandwidth_total_mbps || 0,
      data.status || 'completed',
      data.error_count || 0
    ];

    return new Promise((resolve, reject) => {
      db.run(sql, values, function(err) {
        if (err) {
          console.error('Error recording stream analytics:', err);
          reject(err);
        } else {
          resolve({ id, rowId: this.lastID });
        }
      });
    });
  }

  /**
   * Update real-time metrics for a stream
   */
  updateRealtimeMetrics(streamId, metrics) {
    if (!this.realtimeMetrics.has(streamId)) {
      this.realtimeMetrics.set(streamId, {
        streamId,
        startTime: Date.now(),
        metrics: []
      });
    }

    const streamMetrics = this.realtimeMetrics.get(streamId);
    streamMetrics.metrics.push({
      timestamp: Date.now(),
      ...metrics
    });

    // Keep only last 100 metrics
    if (streamMetrics.metrics.length > 100) {
      streamMetrics.metrics.shift();
    }

    return streamMetrics;
  }

  /**
   * Get real-time metrics for a stream
   */
  getRealtimeMetrics(streamId) {
    return this.realtimeMetrics.get(streamId) || null;
  }

  /**
   * Clear real-time metrics for a stream
   */
  clearRealtimeMetrics(streamId) {
    this.realtimeMetrics.delete(streamId);
  }

  /**
   * Get stream analytics by stream ID
   */
  getStreamAnalytics(streamId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM stream_analytics WHERE stream_id = ? ORDER BY timestamp DESC`;
      
      db.all(sql, [streamId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get analytics summary for a user
   */
  getUserAnalyticsSummary(userId, days = 30) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_streams,
          SUM(duration_seconds) as total_duration_seconds,
          AVG(bitrate_avg) as avg_bitrate,
          AVG(bandwidth_total_mbps) as avg_bandwidth,
          SUM(error_count) as total_errors,
          AVG(dropped_frames) as avg_dropped_frames
        FROM stream_analytics
        WHERE user_id = ?
          AND timestamp >= datetime('now', '-' || ? || ' days')
      `;
      
      db.get(sql, [userId, days], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Get analytics for date range
   */
  getAnalyticsByDateRange(startDate, endDate, userId = null) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          DATE(timestamp) as date,
          COUNT(*) as stream_count,
          SUM(duration_seconds) as total_duration,
          AVG(bitrate_avg) as avg_bitrate,
          AVG(bandwidth_total_mbps) as avg_bandwidth,
          SUM(error_count) as total_errors
        FROM stream_analytics
        WHERE timestamp BETWEEN ? AND ?
      `;
      
      const params = [startDate, endDate];
      
      if (userId) {
        sql += ` AND user_id = ?`;
        params.push(userId);
      }
      
      sql += ` GROUP BY DATE(timestamp) ORDER BY date DESC`;
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get top streams by duration
   */
  getTopStreamsByDuration(limit = 10, userId = null) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          sa.*,
          s.title,
          s.platform
        FROM stream_analytics sa
        LEFT JOIN streams s ON sa.stream_id = s.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (userId) {
        sql += ` AND sa.user_id = ?`;
        params.push(userId);
      }
      
      sql += ` ORDER BY sa.duration_seconds DESC LIMIT ?`;
      params.push(limit);
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get bandwidth usage statistics
   */
  getBandwidthStats(days = 7, userId = null) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          DATE(timestamp) as date,
          AVG(bandwidth_upload_mbps) as avg_upload,
          AVG(bandwidth_download_mbps) as avg_download,
          AVG(bandwidth_total_mbps) as avg_total,
          MAX(bandwidth_total_mbps) as peak_bandwidth
        FROM stream_analytics
        WHERE timestamp >= datetime('now', '-' || ? || ' days')
      `;
      
      const params = [days];
      
      if (userId) {
        sql += ` AND user_id = ?`;
        params.push(userId);
      }
      
      sql += ` GROUP BY DATE(timestamp) ORDER BY date DESC`;
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(streamId = null, days = 7) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          AVG(dropped_frames) as avg_dropped_frames,
          AVG(encoding_lag_ms) as avg_encoding_lag,
          COUNT(CASE WHEN network_quality = 'good' THEN 1 END) as good_quality_count,
          COUNT(CASE WHEN network_quality = 'fair' THEN 1 END) as fair_quality_count,
          COUNT(CASE WHEN network_quality = 'poor' THEN 1 END) as poor_quality_count,
          SUM(error_count) as total_errors
        FROM stream_analytics
        WHERE timestamp >= datetime('now', '-' || ? || ' days')
      `;
      
      const params = [days];
      
      if (streamId) {
        sql += ` AND stream_id = ?`;
        params.push(streamId);
      }
      
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Record system analytics
   */
  recordSystemAnalytics(data) {
    if (!this.enabled) return;

    const id = uuidv4();
    
    const sql = `INSERT INTO system_analytics (
      id, cpu_usage, memory_usage, disk_usage,
      network_upload_mbps, network_download_mbps,
      active_streams, total_bandwidth_mbps,
      avg_response_time_ms, error_rate
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      id,
      data.cpu_usage || 0,
      data.memory_usage || 0,
      data.disk_usage || 0,
      data.network_upload_mbps || 0,
      data.network_download_mbps || 0,
      data.active_streams || 0,
      data.total_bandwidth_mbps || 0,
      data.avg_response_time_ms || 0,
      data.error_rate || 0
    ];

    return new Promise((resolve, reject) => {
      db.run(sql, values, function(err) {
        if (err) {
          console.error('Error recording system analytics:', err);
          reject(err);
        } else {
          resolve({ id, rowId: this.lastID });
        }
      });
    });
  }

  /**
   * Get system analytics
   */
  getSystemAnalytics(hours = 24) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM system_analytics
        WHERE timestamp >= datetime('now', '-' || ? || ' hours')
        ORDER BY timestamp DESC
      `;
      
      db.all(sql, [hours], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Clean up old analytics data
   */
  cleanupOldData() {
    if (!this.enabled) return;

    const sql = `
      DELETE FROM stream_analytics
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [this.retentionDays], function(err) {
        if (err) {
          console.error('Error cleaning up analytics:', err);
          reject(err);
        } else {
          console.log(`🧹 Cleaned up ${this.changes} old analytics records`);
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * Get dashboard summary
   */
  async getDashboardSummary(userId = null, days = 7) {
    try {
      const [userSummary, bandwidthStats, performanceMetrics, topStreams] = await Promise.all([
        this.getUserAnalyticsSummary(userId, days),
        this.getBandwidthStats(days, userId),
        this.getPerformanceMetrics(null, days),
        this.getTopStreamsByDuration(5, userId)
      ]);

      return {
        summary: userSummary,
        bandwidth: bandwidthStats,
        performance: performanceMetrics,
        topStreams: topStreams,
        period: `${days} days`
      };
    } catch (error) {
      console.error('Error getting dashboard summary:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new AnalyticsService();
