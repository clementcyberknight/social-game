import http from 'k6/http';
import { check, sleep } from 'k6';

// Target URL of the social game
const BASE_URL = __ENV.TARGET_URL || 'https://bpo1qoywpjvfg7xosodqdkz5.rocketrush.space';

export const options = {
  discardResponseBodies: false, // needed to parse auth tokens
  scenarios: {
    social_traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 },   // Warmup to 200 VUs
        { duration: '1m',  target: 1000 },  // Ramp to 1,000 VUs
        { duration: '2m',  target: 2000 },  // Push and sustain 2,000 VUs
        { duration: '30s', target: 0 },     // Cooldown
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // Latency p95 < 500ms, p99 < 1000ms
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    // Errors (excluding expected 429 rate limits) should be < 5%
    'http_req_failed{status:!429}': ['rate<0.05'],
  },
};

// Seed tag identified in database: mul06cjo
const SEED_TAG = 'mul06cjo';

export default function () {
  let token = null;
  const vuId = __VU;
  const iterId = __ITER;

  // ---------------------------------------------------------
  // 1. SIGNUP or LOGIN FLOW
  // ---------------------------------------------------------
  // Rotate actions: 20% attempt signup, 80% login with seed accounts
  if (iterId % 5 === 0) {
    // Attempt Signup
    const signupEmail = `k6-${vuId}-${Date.now()}@loadtest.test`;
    const signupPayload = JSON.stringify({
      email: signupEmail,
      password: 'Seedpass1',
    });

    const signupRes = http.post(`${BASE_URL}/signup`, signupPayload, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /signup' },
    });

    check(signupRes, {
      'signup 201 or 429 (rate-limited)': (r) => r.status === 201 || r.status === 429,
    });
  }

  // Attempt Login to acquire Bearer JWT token
  // Seeded users are: seed-mul06cjo-0@seed.test through seed-mul06cjo-999@seed.test
  const seedIndex = vuId % 1000;
  const loginPayload = JSON.stringify({
    email: `seed-${SEED_TAG}-${seedIndex}@seed.test`,
    password: 'Seedpass1',
  });

  const loginRes = http.post(`${BASE_URL}/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /login' },
  });

  const loginOk = check(loginRes, {
    'login 200 or 429 (rate-limited)': (r) => r.status === 200 || r.status === 429,
  });

  if (loginRes.status === 200) {
    try {
      const body = JSON.parse(loginRes.body);
      token = body.token;
    } catch (e) {
      // ignore parse error if any
    }
  }

  sleep(1);

  // ---------------------------------------------------------
  // 2. READ FEED (Keyset pagination, cached)
  // ---------------------------------------------------------
  const feedRes = http.get(`${BASE_URL}/posts?limit=20`, {
    tags: { name: 'GET /posts' },
  });
  check(feedRes, {
    'feed status is 200': (r) => r.status === 200,
  });

  sleep(1);

  // ---------------------------------------------------------
  // 3. READ SINGLE POST (Cached 30s in Redis)
  // ---------------------------------------------------------
  const postId = 20000 + (vuId % 38);
  const postRes = http.get(`${BASE_URL}/posts/${postId}`, {
    tags: { name: 'GET /posts/:id' },
  });
  check(postRes, {
    'post status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  });

  sleep(1);

  // ---------------------------------------------------------
  // 4. AUTHENTICATED ACTIONS (If token acquired)
  // ---------------------------------------------------------
  if (token) {
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    // Like a post
    const likeRes = http.post(`${BASE_URL}/posts/${postId}/like`, null, {
      headers: authHeaders,
      tags: { name: 'POST /posts/:id/like' },
    });
    check(likeRes, {
      'like status is 200': (r) => r.status === 200,
    });

    sleep(1);

    // Create a new post (every 10th iteration to keep DB growth balanced)
    if (iterId % 10 === 0) {
      const createPayload = JSON.stringify({
        body: `Post from k6 VU ${vuId} iter ${iterId}`,
      });
      const createRes = http.post(`${BASE_URL}/posts`, createPayload, {
        headers: authHeaders,
        tags: { name: 'POST /posts' },
      });
      check(createRes, {
        'create post status is 201': (r) => r.status === 201,
      });
    }
  }

  // ---------------------------------------------------------
  // 5. HEALTH CHECK
  // ---------------------------------------------------------
  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { name: 'GET /health' },
  });
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
