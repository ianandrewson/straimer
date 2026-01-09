# Authentication Pattern

**Category**: Security
**Confidence**: High
**Location**: `backend/src/middleware/auth.ts`

---

## Overview

The Authentication pattern implements simple bearer token authentication for protecting API endpoints. All endpoints except `/health` require a valid bearer token in the `Authorization` header. This approach prioritizes simplicity over advanced features like token expiration or per-user tokens.

---

## Architecture

```
┌──────────┐
│  Client  │
└────┬─────┘
     │ Authorization: Bearer <token>
     v
┌──────────────────┐
│ authMiddleware   │
│ (validate token) │
└────┬─────────────┘
     │
     ├─ Valid? ──> Continue to route handler
     │
     └─ Invalid? ──> 401 Unauthorized
```

---

## Implementation

### Middleware Function

```typescript
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants';

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Extract Authorization header
  const authHeader = req.headers.authorization;

  // Check header exists and starts with "Bearer "
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_MESSAGES.INVALID_API_KEY,
    });
    return;
  }

  // Extract token (remove "Bearer " prefix)
  const token = authHeader.substring(7);

  // Validate token against configured API key
  if (token !== config.API_KEY) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_MESSAGES.INVALID_API_KEY,
    });
    return;
  }

  // Token valid, continue to route handler
  next();
};
```

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/middleware/auth.ts`

---

## Usage

### Protecting Routes

```typescript
import { authMiddleware } from './middleware/auth';

// Apply to all routes under /api and /stream
router.use('/api', authMiddleware);
router.use('/stream', authMiddleware);

// Now all API and stream routes require authentication
router.get('/api/library', libraryHandler);           // Protected
router.post('/api/sessions', sessionHandler);         // Protected
router.get('/stream/:sessionId/master.m3u8', streamHandler); // Protected

// Public routes (no middleware)
app.get('/health', healthHandler);  // Public
```

---

## Token Format

### Header Format

```
Authorization: Bearer <token>
```

**Components**:
- `Authorization` - HTTP header name (case-insensitive)
- `Bearer` - Authentication scheme (case-sensitive, followed by space)
- `<token>` - Arbitrary string matching `config.API_KEY`

### Example

```bash
curl -H "Authorization: Bearer my-secret-token-123" \
  http://localhost:3000/api/library
```

---

## Configuration

### Setting API Key

```env
# backend/.env
API_KEY=my-secret-token-123
```

**Security Best Practices**:
- Use long, random tokens (32+ characters)
- Use different tokens per environment (dev/staging/prod)
- Never commit tokens to version control
- Rotate tokens periodically

**Token Generation**:
```bash
# Generate random token (Linux/macOS)
openssl rand -hex 32

# Output: 7a8f3e2b1c9d4a5e6f7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f
```

---

## Client Integration

### JavaScript/TypeScript

```typescript
const API_KEY = 'my-secret-token-123';

async function fetchLibrary() {
  const response = await fetch('http://localhost:3000/api/library', {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
    },
  });

  if (response.status === 401) {
    throw new Error('Unauthorized - Invalid API key');
  }

  return response.json();
}
```

### cURL

```bash
# Set token as variable
TOKEN="my-secret-token-123"

# Use in requests
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/library

curl -H "Authorization: Bearer $TOKEN" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"audioFileId":"audio-001"}' \
  http://localhost:3000/api/sessions
```

### Mobile Client (React Native)

```typescript
const API_BASE_URL = 'http://raspberrypi.local:3000';
const API_KEY = 'my-secret-token-123';

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    throw new Error('Authentication failed');
  }

  return response.json();
}

// Usage
const library = await apiRequest('/api/library');
const session = await apiRequest('/api/sessions', {
  method: 'POST',
  body: JSON.stringify({ audioFileId: 'audio-001' }),
});
```

---

## Error Responses

### Missing Authorization Header

**Request**:
```bash
curl http://localhost:3000/api/library
```

**Response**: 401 Unauthorized
```json
{
  "error": "Invalid or missing API key"
}
```

---

### Invalid Bearer Format

**Request**:
```bash
curl -H "Authorization: my-secret-token-123" \
  http://localhost:3000/api/library
```

**Response**: 401 Unauthorized
```json
{
  "error": "Invalid or missing API key"
}
```

**Note**: Missing "Bearer " prefix.

---

### Invalid Token

**Request**:
```bash
curl -H "Authorization: Bearer wrong-token" \
  http://localhost:3000/api/library
```

**Response**: 401 Unauthorized
```json
{
  "error": "Invalid or missing API key"
}
```

---

## Security Considerations

### Current Limitations

1. **No Token Expiration**
   - Tokens valid indefinitely
   - Compromised tokens remain valid until manually rotated

2. **No Per-User Tokens**
   - Single shared token for all clients
   - Cannot revoke access for individual users

3. **No Rate Limiting**
   - No protection against brute-force attacks
   - No throttling of requests per token

4. **No HTTPS Enforcement**
   - Tokens sent in plaintext over HTTP
   - Vulnerable to network sniffing

5. **No Token Scopes**
   - All tokens have full access
   - Cannot restrict permissions per token

---

### Recommended Mitigations

#### 1. Use HTTPS

**Production Setup**:
```bash
# Use reverse proxy (nginx/caddy) with SSL
server {
  listen 443 ssl;
  server_name straimer.example.com;

  ssl_certificate /etc/ssl/certs/cert.pem;
  ssl_certificate_key /etc/ssl/private/key.pem;

  location / {
    proxy_pass http://localhost:3000;
  }
}
```

#### 2. Implement Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later',
});

app.use('/api', limiter);
```

#### 3. Use Environment-Specific Tokens

```bash
# .env.development
API_KEY=dev-token-for-testing

# .env.production
API_KEY=<long-random-production-token>
```

#### 4. Log Authentication Attempts

```typescript
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(
      { ip: req.ip, path: req.path },
      'Authentication failed - Missing or invalid header'
    );
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: '...' });
  }

  const token = authHeader.substring(7);

  if (token !== config.API_KEY) {
    logger.warn(
      { ip: req.ip, path: req.path, token: token.substring(0, 8) + '...' },
      'Authentication failed - Invalid token'
    );
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: '...' });
  }

  next();
};
```

---

## Testing

### Unit Testing

```typescript
import request from 'supertest';
import { app } from './app';

const VALID_TOKEN = 'test-token-123';
const INVALID_TOKEN = 'wrong-token';

describe('Authentication Middleware', () => {
  beforeAll(() => {
    process.env.API_KEY = VALID_TOKEN;
  });

  it('allows access with valid token', async () => {
    const response = await request(app)
      .get('/api/library')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(response.status).toBe(200);
  });

  it('rejects request without authorization header', async () => {
    const response = await request(app).get('/api/library');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid or missing API key');
  });

  it('rejects request with invalid bearer format', async () => {
    const response = await request(app)
      .get('/api/library')
      .set('Authorization', VALID_TOKEN); // Missing "Bearer "

    expect(response.status).toBe(401);
  });

  it('rejects request with invalid token', async () => {
    const response = await request(app)
      .get('/api/library')
      .set('Authorization', `Bearer ${INVALID_TOKEN}`);

    expect(response.status).toBe(401);
  });

  it('allows public endpoint without token', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
  });
});
```

### Manual Testing

```bash
# Test script (backend/tests/test-api.sh)
#!/bin/bash

TOKEN="your-api-key-here"
BASE_URL="http://localhost:3000"

# Test valid token
echo "Testing with valid token..."
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/library"

# Test invalid token
echo "Testing with invalid token..."
curl -H "Authorization: Bearer wrong-token" \
  "$BASE_URL/api/library"

# Test missing header
echo "Testing without authorization header..."
curl "$BASE_URL/api/library"

# Test public endpoint
echo "Testing public endpoint..."
curl "$BASE_URL/health"
```

---

## Future Enhancements

### 1. JWT Tokens

Replace static tokens with JWTs:

```typescript
import jwt from 'jsonwebtoken';

// Generate token
const token = jwt.sign(
  { userId: '123', role: 'user' },
  config.JWT_SECRET,
  { expiresIn: '1h' }
);

// Verify token
export const authMiddleware = (req, res, next) => {
  const token = extractToken(req);

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

**Benefits**:
- Token expiration
- Embedded user information
- Token refresh mechanism

---

### 2. API Key Database

Store API keys in database with metadata:

```typescript
interface ApiKey {
  id: string;
  key: string;
  name: string;
  userId: string;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  permissions: string[];
}

// Validate against database
export const authMiddleware = async (req, res, next) => {
  const token = extractToken(req);

  const apiKey = await db.apiKeys.findOne({ key: token });

  if (!apiKey || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Update last used timestamp
  await db.apiKeys.updateOne(
    { id: apiKey.id },
    { $set: { lastUsedAt: new Date() } }
  );

  req.user = { userId: apiKey.userId, permissions: apiKey.permissions };
  next();
};
```

---

### 3. OAuth 2.0

Full OAuth 2.0 implementation for third-party clients:

```typescript
app.get('/oauth/authorize', (req, res) => {
  // Show authorization page
});

app.post('/oauth/token', (req, res) => {
  // Issue access token
});

app.get('/oauth/revoke', (req, res) => {
  // Revoke token
});
```

---

## Related Files

- `backend/src/middleware/auth.ts` - Authentication middleware implementation
- `backend/src/config/env.ts` - API key configuration
- `backend/src/routes/index.ts` - Middleware application
- `backend/.env.example` - API key setup example

---

## Related Patterns

- [Middleware Domain](../domains/middleware.md) - Overall middleware architecture
- [Configuration Domain](../domains/configuration.md) - Environment variable management

---

**References**:
- [RFC 6750 - Bearer Token Usage](https://tools.ietf.org/html/rfc6750)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
