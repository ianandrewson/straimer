#!/bin/bash

# Test script for Straimer API endpoints
# Prerequisites: Server must be running (yarn dev:backend)

BASE_URL="http://localhost:3000"
API_KEY="test-api-key-development"

echo "Testing Straimer API endpoints"
echo "================================"
echo ""

# Test 1: Health check (no auth required)
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/health" | jq .
echo ""

# Test 2: Get library (requires auth)
echo "2. Testing library endpoint..."
curl -s -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/library" | jq .
echo ""

# Test 3: Create session (requires auth)
echo "3. Testing session creation..."
SESSION_RESPONSE=$(curl -s -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -X POST "$BASE_URL/api/sessions" \
  -d '{"audioFileId": "test-001"}')
echo "$SESSION_RESPONSE" | jq .

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.sessionId')
echo ""
echo "Created session: $SESSION_ID"
echo ""

# Test 4: Get session status
echo "4. Testing session status..."
curl -s -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/sessions/$SESSION_ID" | jq .
echo ""

# Test 5: List all sessions
echo "5. Testing list all sessions..."
curl -s -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/sessions" | jq .
echo ""

# Wait for ffmpeg to generate some segments
echo "6. Waiting 5 seconds for segments to be generated..."
sleep 5
echo ""

# Test 6: Get master playlist
echo "7. Testing master playlist..."
curl -s -H "Authorization: Bearer $API_KEY" "$BASE_URL/stream/$SESSION_ID/master.m3u8"
echo ""
echo ""

# Test 7: Get variant playlist (64k)
echo "8. Testing variant playlist (64k)..."
curl -s -H "Authorization: Bearer $API_KEY" "$BASE_URL/stream/$SESSION_ID/64k/playlist.m3u8" | head -20
echo ""
echo ""

# Test 8: Try to get a segment (may not exist yet)
echo "9. Testing segment retrieval (64k/segment0.ts)..."
SEGMENT_RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $API_KEY" "$BASE_URL/stream/$SESSION_ID/64k/segment0.ts")
HTTP_CODE=$(echo "$SEGMENT_RESPONSE" | tail -1)
echo "HTTP Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
  echo "Segment retrieved successfully"
else
  echo "Segment not found (may still be generating)"
fi
echo ""

# Test 9: Delete session
echo "10. Testing session deletion..."
curl -s -H "Authorization: Bearer $API_KEY" -X DELETE "$BASE_URL/api/sessions/$SESSION_ID" | jq .
echo ""

# Test 10: Test auth failure
echo "11. Testing auth failure (no token)..."
curl -s "$BASE_URL/api/library" | jq .
echo ""

echo "================================"
echo "API tests complete"
