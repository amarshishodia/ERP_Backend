const { createClient } = require('redis');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      this.client.on('error', (err) => {
        console.log('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.log('Redis connection failed:', error.message);
      this.isConnected = false;
    }
  }

  async get(key) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.log('Cache get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttl = 300) { // Default 5 minutes TTL
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.log('Cache set error:', error.message);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.log('Cache delete error:', error.message);
      return false;
    }
  }

  async invalidatePattern(pattern) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.log('Cache invalidate pattern error:', error.message);
      return false;
    }
  }

  // Product-specific cache methods
  async getProducts(page = 1, limit = 50, status = true) {
    const key = `products:${status}:${page}:${limit}`;
    return await this.get(key);
  }

  async setProducts(page = 1, limit = 50, status = true, data, ttl = 300) {
    const key = `products:${status}:${page}:${limit}`;
    return await this.set(key, data, ttl);
  }

  async getSearchResults(searchTerm, page = 1, limit = 20) {
    const key = `products:search:${searchTerm}:${page}:${limit}`;
    return await this.get(key);
  }

  async setSearchResults(searchTerm, page = 1, limit = 20, data, ttl = 180) {
    const key = `products:search:${searchTerm}:${page}:${limit}`;
    return await this.set(key, data, ttl);
  }

  async getReferenceData(type) {
    const key = `reference:${type}`;
    return await this.get(key);
  }

  async setReferenceData(type, data, ttl = 1800) { // 30 minutes for reference data
    const key = `reference:${type}`;
    return await this.set(key, data, ttl);
  }

  async invalidateProductCache() {
    await this.invalidatePattern('products:*');
  }

  async invalidateReferenceCache() {
    await this.invalidatePattern('reference:*');
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
