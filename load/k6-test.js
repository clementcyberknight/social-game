import http from 'k6/http';
import { check, sleep } from 'k6';

// Target URL of the social game
const BASE_URL = __ENV.TARGET_URL || 'https://bpo1qoywpjvfg7xosodqdkz5.rocketrush.space';
const SEED_TAG = 'mul06cjo';

export const options = {
  discardResponseBodies: false, // needed to extract tokens
  scenarios: {
    social_traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 },   // Warmup to 200 VUs
        { duration: '1m',  target: 1000 },  // Ramp to 1,000 VUs
        { duration: '2m',  target: 2000 },  // Sustain 2,000 peak VUs
        { duration: '30s', target: 0 },     // Cooldown
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // Latency targets: p95 < 500ms, p99 < 1000ms
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    // Non-429 failures should be under 5%
    'http_req_failed{status:!429}': ['rate<0.05'],
  },
};

// VU-scoped variable: persists across iterations for THIS specific VU.
// Real users log in once per session and reuse their JWT Bearer token!
let token = null;
let sessionInitialized = false;

export default function () {
  const vuId = __VU;
  const iterId = __ITER;

  // -------------------------------------------------------------------
  // 1. SESSION INITIALIZATION (Runs ONCE per VU on its first iteration)
  // -------------------------------------------------------------------
  if (!sessionInitialized) {
    sessionInitialized = true;

    // A small subset of VUs test signup flow (1 out of every 50 VUs)
    if (vuId % 50 === 0) {
      const signupEmail = `k6-user-${vuId}-${Date.now()}@loadtest.test`;
      const signupRes = http.post(`${BASE_URL}/signup`, JSON.stringify({
        email: signupEmail,
        password: 'Seedpass1',
      }), {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'POST /signup' },
      });

      check(signupRes, {
        'signup 201 or 429': (r) => r.status === 201 || r.status === 429,
      });

      if (signupRes.status === 201) {
        // Log in with the newly signed-up user
        const loginRes = http.post(`${BASE_URL}/login`, JSON.stringify({
          email: signupEmail,
          password: 'Seedpass1',
        }), {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'POST /login' },
        });
        if (loginRes.status === 200) {
          try { token = JSON.parse(loginRes.body).token; } catch {}
        }
      }
    }

    // If not signed up, log in with an existing seeded account
    if (!token) {
      const seedIndex = vuId % 1000;
      const loginRes = http.post(`${BASE_URL}/login`, JSON.stringify({
        email: `seed-${SEED_TAG}-${seedIndex}@seed.test`,
        password: 'Seedpass1',
      }), {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'POST /login' },
      });

      check(loginRes, {
        'login 200 or 429': (r) => r.status === 200 || r.status === 429,
      });

      if (loginRes.status === 200) {
        try {
          token = JSON.parse(loginRes.body).token;
        } catch {}
      }
    }

    // Realistic user think time after logging in
    sleep(1);
  }

  // -------------------------------------------------------------------
  // 2. ACTIVE USER SESSION (Feed, Posts, Likes, Creation)
  // -------------------------------------------------------------------

  // Read Feed (Keyset pagination, cached in Redis)
  const feedRes = http.get(`${BASE_URL}/posts?limit=20`, {
    tags: { name: 'GET /posts' },
  });
  check(feedRes, {
    'feed status is 200': (r) => r.status === 200,
  });

  sleep(1);

  // Read Single Post (Cached in Redis)
  const postId = 20000 + (vuId % 38);
  const postRes = http.get(`${BASE_URL}/posts/${postId}`, {
    tags: { name: 'GET /posts/:id' },
  });
  check(postRes, {
    'post status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  });

  sleep(1);

  // Authenticated Actions (Uses persistent Bearer token)
  if (token) {
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    // Like post (Idempotent like)
    const likeRes = http.post(`${BASE_URL}/posts/${postId}/like`, null, {
      headers: authHeaders,
      tags: { name: 'POST /posts/:id/like' },
    });
    check(likeRes, {
      'like status is 200': (r) => r.status === 200,
    });

    sleep(1);

    // Create post (every 10th iteration to simulate realistic post creation rate)
    if (iterId % 10 === 0) {
      const createRes = http.post(`${BASE_URL}/posts`, JSON.stringify({
        body: `k6 post from VU ${vuId} iter ${iterId}`,
      }), {
        headers: authHeaders,
        tags: { name: 'POST /posts' },
      });
      check(createRes, {
        'create post status is 201': (r) => r.status === 201,
      });
    }
  }

  // Health check
  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { name: 'GET /health' },
  });
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
