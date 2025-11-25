const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * SSL/TLS Configuration Module
 * Handles HTTPS setup and certificate management
 */

class SSLConfig {
  constructor() {
    this.enabled = process.env.ENABLE_HTTPS === 'true';
    this.forceHttps = process.env.FORCE_HTTPS === 'true';
    this.certPath = process.env.SSL_CERT_PATH;
    this.keyPath = process.env.SSL_KEY_PATH;
  }

  /**
   * Check if SSL is properly configured
   */
  isConfigured() {
    if (!this.enabled) {
      return false;
    }

    if (!this.certPath || !this.keyPath) {
      console.warn('⚠️  HTTPS enabled but SSL_CERT_PATH or SSL_KEY_PATH not configured');
      return false;
    }

    if (!fs.existsSync(this.certPath)) {
      console.error(`❌ SSL certificate not found: ${this.certPath}`);
      return false;
    }

    if (!fs.existsSync(this.keyPath)) {
      console.error(`❌ SSL private key not found: ${this.keyPath}`);
      return false;
    }

    return true;
  }

  /**
   * Get SSL credentials for HTTPS server
   */
  getCredentials() {
    if (!this.isConfigured()) {
      throw new Error('SSL not properly configured');
    }

    try {
      const cert = fs.readFileSync(this.certPath, 'utf8');
      const key = fs.readFileSync(this.keyPath, 'utf8');

      return {
        cert,
        key,
        // Additional security options
        secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1,
        ciphers: [
          'ECDHE-RSA-AES128-GCM-SHA256',
          'ECDHE-ECDSA-AES128-GCM-SHA256',
          'ECDHE-RSA-AES256-GCM-SHA384',
          'ECDHE-ECDSA-AES256-GCM-SHA384',
          'DHE-RSA-AES128-GCM-SHA256',
          'ECDHE-RSA-AES128-SHA256',
          'DHE-RSA-AES128-SHA256',
          'ECDHE-RSA-AES256-SHA384',
          'DHE-RSA-AES256-SHA384',
          'ECDHE-RSA-AES256-SHA256',
          'DHE-RSA-AES256-SHA256',
          'HIGH',
          '!aNULL',
          '!eNULL',
          '!EXPORT',
          '!DES',
          '!RC4',
          '!MD5',
          '!PSK',
          '!SRP',
          '!CAMELLIA'
        ].join(':'),
        honorCipherOrder: true
      };
    } catch (error) {
      console.error('❌ Error reading SSL certificates:', error.message);
      throw error;
    }
  }

  /**
   * Create HTTPS server
   */
  createServer(app) {
    if (!this.isConfigured()) {
      console.log('ℹ️  HTTPS not configured, using HTTP only');
      return null;
    }

    try {
      const credentials = this.getCredentials();
      const httpsServer = https.createServer(credentials, app);
      
      console.log('✅ HTTPS server configured successfully');
      return httpsServer;
    } catch (error) {
      console.error('❌ Failed to create HTTPS server:', error.message);
      return null;
    }
  }

  /**
   * Middleware to force HTTPS redirect
   */
  forceHttpsMiddleware() {
    return (req, res, next) => {
      if (!this.forceHttps) {
        return next();
      }

      // Check if request is already HTTPS
      if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        return next();
      }

      // Redirect to HTTPS
      const httpsUrl = `https://${req.hostname}${req.url}`;
      console.log(`🔒 Redirecting to HTTPS: ${httpsUrl}`);
      res.redirect(301, httpsUrl);
    };
  }

  /**
   * Security headers middleware
   */
  securityHeadersMiddleware() {
    return (req, res, next) => {
      // HSTS (HTTP Strict Transport Security)
      if (this.enabled && this.forceHttps) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }

      // Prevent clickjacking
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');

      // Prevent MIME type sniffing
      res.setHeader('X-Content-Type-Options', 'nosniff');

      // XSS Protection
      res.setHeader('X-XSS-Protection', '1; mode=block');

      // Referrer Policy
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

      // Content Security Policy (basic)
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self';"
      );

      next();
    };
  }

  /**
   * Get server configuration info
   */
  getInfo() {
    return {
      httpsEnabled: this.enabled,
      forceHttps: this.forceHttps,
      configured: this.isConfigured(),
      certPath: this.certPath ? '***configured***' : 'not set',
      keyPath: this.keyPath ? '***configured***' : 'not set'
    };
  }
}

module.exports = new SSLConfig();
