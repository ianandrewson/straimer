# Middleware Domain

**Path**: `backend/src/middleware/`
**Purpose**: Express middleware for authentication, logging, and error handling
**Confidence**: High

---

## Overview

The Middleware domain implements cross-cutting concerns as Express middleware functions. These include bearer token authentication, HTTP request logging with Pino, and centralized error handling.

---

## Files

### `auth.ts`
**Purpose**: Bearer token authentication middleware

**Exported Middleware**:
- `authMiddleware(req, res, next)` - Validates bearer token in Authorization header

**Authentication Flow**:
1. Extract `Authorization` header from request
2. Verify format: `Bearer <token>`
3. Compare token against `config.API_KEY`
4. If valid: call `next()` to continue
5. If invalid: return 401 Unauthorized

**Code Structure**:
```typescript
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_MESSAGES.INVALID_API_KEY
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  if (token !== config.API_KEY) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_MESSAGES.INVALID_API_KEY
    });
  }

  next();
};
```

**Usage**:
```typescript
// Protect specific routes
router.get('/api/sessions', authMiddleware, sessionController);

// Protect entire route group
router.use('/api', authMiddleware);
```

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/middleware/auth.ts`

---

### `logger.ts`
**Purpose**: HTTP request logging with Pino

**Exported Middleware**:
- `requestLogger` - Pino-http middleware instance

**Features**:
- Logs all incoming HTTP requests
- Captures request method, URL, status code, response time
- Uses structured JSON logging (Pino format)
- Integrates with application logger instance

**Configuration**:
```typescript
import pinoHttp from 'pino-http';
import { logger } from '../utils/logger';

export const requestLogger = pinoHttp({
  logger: logger,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed`;
  },
});
```

**Log Output Example**:
```json
{
  "level": 30,
  "time": 1641234567890,
  "req": {
    "method": "GET",
    "url": "/api/sessions",
    "remoteAddress": "192.168.1.100"
  },
  "res": {
    "statusCode": 200
  },
  "responseTime": 45,
  "msg": "GET /api/sessions completed"
}
```

**Usage**:
```typescript
// Apply to all routes
app.use(requestLogger);
```

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/middleware/logger.ts`

---

### `error.ts`
**Purpose**: Global error handling and 404 handler

**Exported Middleware**:
- `errorHandler(err, req, res, next)` - Global error handler (4-parameter signature)
- `notFoundHandler(req, res)` - 404 handler for undefined routes

**Error Handler**:
```typescript
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error(
    {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    },
    'Unhandled error'
  );

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: 'Internal server error',
    message: config.NODE_ENV === 'development' ? err.message : undefined,
  });
};
```

**Features**:
- Logs error details with stack trace
- Returns generic error message in production
- Returns detailed error in development
- Always returns 500 status code

**404 Handler**:
```typescript
export const notFoundHandler = (req: Request, res: Response) => {
  logger.warn({ path: req.path, method: req.method }, 'Route not found');

  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: 'Not found',
    path: req.path,
  });
};
```

**Usage**:
```typescript
// Apply after all routes (order matters!)
app.use(notFoundHandler);  // Must be before errorHandler
app.use(errorHandler);     // Must be last
```

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/middleware/error.ts`

---

## Middleware Order

**Critical**: Middleware must be applied in the correct order:

```typescript
// 1. Body parsers
app.use(express.json());

// 2. Request logging (before routes)
app.use(requestLogger);

// 3. Public routes (no auth)
app.get('/health', healthHandler);

// 4. Protected routes (with auth)
app.use('/api', authMiddleware);
app.use('/stream', authMiddleware);

// 5. 404 handler (after all routes)
app.use(notFoundHandler);

// 6. Error handler (must be last)
app.use(errorHandler);
```

---

## Authentication Details

### Token Format
- Header: `Authorization: Bearer <token>`
- Token: Arbitrary string matching `config.API_KEY`
- No expiration or refresh mechanism (simple static token)

### Security Considerations
- **No HTTPS enforcement**: Should be handled at reverse proxy level
- **No rate limiting**: Consider adding for production
- **Single token**: All clients share same token (no per-user tokens)
- **Token in plaintext**: Store `API_KEY` securely, use environment variables

### Protected Endpoints
All endpoints except `/health` require authentication:
- `/api/*` - All API routes
- `/stream/*` - All streaming routes

---

## Logging Strategy

### Log Levels
- **info**: Successful requests (2xx, 3xx)
- **warn**: Client errors (4xx)
- **error**: Server errors (5xx)

### Structured Logging
All logs include:
- `method` - HTTP method (GET, POST, etc.)
- `url` - Request URL
- `statusCode` - Response status
- `responseTime` - Time in milliseconds

### Privacy Considerations
- Authorization header NOT logged (sensitive token)
- Request body NOT logged by default
- Consider sanitizing logs in production

---

## Error Handling Strategy

### Error Types
1. **Route Not Found (404)**: Handled by `notFoundHandler`
2. **Validation Errors**: Returned as 400 by route handlers
3. **Authentication Errors**: Returned as 401 by `authMiddleware`
4. **Unhandled Errors**: Caught by `errorHandler`

### Error Response Format
```json
{
  "error": "Error type",
  "message": "Detailed message (development only)"
}
```

### Best Practices
- Use try-catch in async route handlers
- Throw descriptive errors with context
- Let errorHandler catch unexpected errors
- Return appropriate HTTP status codes

---

## Dependencies

- **pino-http** (^9.0.0) - HTTP request logging middleware
- **pino** (^8.17.2) - Logger instance (from utils/logger)

---

## Testing Middleware

### Testing Authentication
```typescript
// Test valid token
const response = await request(app)
  .get('/api/sessions')
  .set('Authorization', `Bearer ${validToken}`);
expect(response.status).toBe(200);

// Test invalid token
const response = await request(app)
  .get('/api/sessions')
  .set('Authorization', 'Bearer invalid');
expect(response.status).toBe(401);

// Test missing token
const response = await request(app)
  .get('/api/sessions');
expect(response.status).toBe(401);
```

### Testing Error Handler
```typescript
// Simulate error in route
app.get('/test-error', () => {
  throw new Error('Test error');
});

const response = await request(app).get('/test-error');
expect(response.status).toBe(500);
expect(response.body.error).toBe('Internal server error');
```

---

## Common Issues

**Issue**: 401 Unauthorized on valid token
- **Solution**: Verify `API_KEY` in `.env` matches token, check whitespace

**Issue**: Error handler not catching errors
- **Solution**: Ensure errorHandler applied last, use async error handling

**Issue**: Logs not appearing
- **Solution**: Check `LOG_LEVEL` in `.env`, verify pino configuration

**Issue**: CORS errors from client
- **Solution**: Configure CORS middleware before routes (already done in index.ts)

---

## Future Enhancements

- [ ] Add rate limiting middleware (express-rate-limit)
- [ ] Add request validation middleware (express-validator or Joi)
- [ ] Add CORS configuration per environment
- [ ] Add request ID tracking across logs
- [ ] Add JWT token support with expiration
- [ ] Add API key rotation mechanism

---

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/middleware/`
**Key Files**: `auth.ts`, `logger.ts`, `error.ts`
