// Simple in-memory rate limiter for serverless functions
const store = new Map();

const getKey = (namespace, identifier) => `${namespace}:${identifier}`;

const checkRateLimit = (namespace, identifier, maxRequests, windowMs) => {
  const key = getKey(namespace, identifier);
  const now = Date.now();
  
  if (!store.has(key)) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }
  
  const entry = store.get(key);
  
  // Reset window if expired
  if (now > entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }
  
  // Check if limit exceeded
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }
  
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetTime: entry.resetTime };
};

const cleanup = () => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now > value.resetTime) {
      store.delete(key);
    }
  }
};

// Cleanup every 10 minutes
setInterval(cleanup, 10 * 60 * 1000);

module.exports = { checkRateLimit };
