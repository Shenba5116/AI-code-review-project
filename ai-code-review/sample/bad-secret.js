// sample/bad-secret.js
// This file intentionally contains a hardcoded secret to demonstrate detection
const API_KEY = "my-secret-token-123"; // intentional secret
console.log('Loaded API key length:', API_KEY.length);
