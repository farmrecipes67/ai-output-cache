/**
 * ai-output-cache
 * Semantic caching for AI responses using cosine similarity.
 * @module ai-output-cache
 */

class AIOutputCache {
  constructor(options = {}) {
    this.callAI = options.callAI;
    this.getEmbedding = options.getEmbedding; // async (text) => number[]
    this.similarityThreshold = options.similarityThreshold || 0.92;
    this.maxEntries = options.maxEntries || 1000;
    this.ttlMs = options.ttlMs || 3600000; // 1 hour default
    this.cache = [];
    this.stats = { hits: 0, misses: 0, evictions: 0 };
    if (!this.callAI) throw new Error('callAI function is required');
  }

  async query(prompt, options = {}) {
    this._evictExpired();

    if (this.getEmbedding) {
      const embedding = await this.getEmbedding(prompt);
      const cached = this._findSimilar(embedding);
      if (cached) {
        this.stats.hits++;
        return { cached: true, response: cached.response, similarity: cached.similarity };
      }
    } else {
      const exact = this.cache.find(e => e.prompt === prompt);
      if (exact && Date.now() - exact.timestamp < this.ttlMs) {
        this.stats.hits++;
        return { cached: true, response: exact.response, similarity: 1.0 };
      }
    }

    this.stats.misses++;
    const response = await this.callAI(prompt, options.systemPrompt || '');

    const entry = { prompt, response, timestamp: Date.now() };
    if (this.getEmbedding) entry.embedding = await this.getEmbedding(prompt);

    this.cache.push(entry);
    if (this.cache.length > this.maxEntries) {
      this.cache.shift();
      this.stats.evictions++;
    }

    return { cached: false, response, similarity: 0 };
  }

  _findSimilar(embedding) {
    let best = null;
    let bestSim = 0;

    for (const entry of this.cache) {
      if (Date.now() - entry.timestamp > this.ttlMs) continue;
      if (!entry.embedding) continue;

      const sim = this._cosineSimilarity(embedding, entry.embedding);
      if (sim > bestSim && sim >= this.similarityThreshold) {
        bestSim = sim;
        best = entry;
      }
    }

    return best ? { response: best.response, similarity: bestSim } : null;
  }

  _cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  _evictExpired() {
    const now = Date.now();
    const before = this.cache.length;
    this.cache = this.cache.filter(e => now - e.timestamp < this.ttlMs);
    this.stats.evictions += before - this.cache.length;
  }

  getStats() { return { ...this.stats, entries: this.cache.length }; }
  clear() { this.cache = []; }
}

module.exports = AIOutputCache;