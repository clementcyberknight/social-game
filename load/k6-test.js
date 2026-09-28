import http from 'k6/http';
import { check, sleep } from 'k6';

// Target URL of the social game
const BASE_URL = __ENV.TARGET_URL || 'https://bpo1qoywpjvfg7xosodqdkz5.rocketrush.space';
const SEED_TAG = 'mul06cjo';

export const options = {
  discardResponseBodies: true, // Optimized for high memory efficiency at 15k VUs
  scenarios: {
    stress_15k: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 1000 },   // Warmup to 1,000 VUs
        { duration: '1m',  target: 3000 },   // Step 1: 3,000 VUs
        { duration: '1m',  target: 7000 },   // Step 2: 7,000 VUs
        { duration: '1m',  target: 12000 },  // Step 3: 12,000 VUs
        { duration: '1m',  target: 15000 },  // Step 4: Peak 15,000 VUs
        { duration: '1m30s', target: 15000 }, // Sustain peak 15,000 VUs
        { duration: '30s', target: 0 },      // Cooldown
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    'http_req_failed{status:!429}': ['rate<0.05'],
  },
};

// VU-scoped token persists across iterations for this specific VU
let token = null;

export default function () {
  const vuId = __VU;
  const iterId = __ITER;

  // -------------------------------------------------------------------
  // 1. AUTHENTICATION (Signup & Login)
  // Runs if user has no token (fresh session or after logging out)
  // -------------------------------------------------------------------
  if (!token) {
    // Occasional Signup flow (1 out of every 20 auth events)
    if (iterId % 20 === 0) {
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
    }

    // Login with seeded user pool to get Bearer JWT token
    const seedIndex = vuId % 1000;
    const loginRes = http.post(`${BASE_URL}/login`, JSON.stringify({
      email: `seed-${SEED_TAG}-${seedIndex}@seed.test`,
      password: 'Seedpass1',
    }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /login' },
      responseType: 'text', // Read response body to extract JWT token
    });

    check(loginRes, {
      'login 200 or 429': (r) => r.status === 200 || r.status === 429,
    });

    if (loginRes.status === 200) {
      try {
        token = JSON.parse(loginRes.body).token;
      } catch {}
    }

    sleep(1);
  }

  // -------------------------------------------------------------------
  // 2. READ FEED & SCROLL (Page 1 -> Extract cursor -> Page 2)
  // -------------------------------------------------------------------
  let nextCursor = null;

  // Initial Feed Read
  const feedRes = http.get(`${BASE_URL}/posts?limit=20`, {
    tags: { name: 'GET /posts (page 1)' },
    responseType: 'text', // Read body to extract next_cursor for scrolling
  });

  check(feedRes, {
    'feed status is 200': (r) => r.status === 200,
  });

  if (feedRes.status === 200) {
    try {
      const data = JSON.parse(feedRes.body);
      nextCursor = data.next_cursor;
    } catch {}
  }

  sleep(1);

  // Scroll to Next Page (Keyset Pagination)
  if (nextCursor) {
    const scrollRes = http.get(`${BASE_URL}/posts?cursor=${nextCursor}&limit=20`, {
      tags: { name: 'GET /posts (scroll)' },
    });
    check(scrollRes, {
      'scroll status is 200': (r) => r.status === 200,
    });
    sleep(1);
  }

  // -------------------------------------------------------------------
  // 3. READ SINGLE POST
  // -------------------------------------------------------------------
  const postId = 20000 + (vuId % 38);
  const postRes = http.get(`${BASE_URL}/posts/${postId}`, {
    tags: { name: 'GET /posts/:id' },
  });
  check(postRes, {
    'post status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  });

  sleep(1);

  // -------------------------------------------------------------------
  // 4. AUTHENTICATED ACTIONS (Like & Create Post)
  // -------------------------------------------------------------------
  if (token) {
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    // Like Post
    const likeRes = http.post(`${BASE_URL}/posts/${postId}/like`, null, {
      headers: authHeaders,
      tags: { name: 'POST /posts/:id/like' },
    });
    check(likeRes, {
      'like status is 200': (r) => r.status === 200,
    });

    sleep(1);

    // Create Post (every 10th iteration)
    if (iterId % 10 === 0) {
      const createRes = http.post(`${BASE_URL}/posts`, JSON.stringify({
        body: `Post from VU ${vuId} iter ${iterId}`,
      }), {
        headers: authHeaders,
        tags: { name: 'POST /posts' },
      });
      check(createRes, {
        'create post status is 201': (r) => r.status === 201,
      });
    }

    // -------------------------------------------------------------------
    // 5. FEW LOGOUT AND RE-LOGIN (5% of cycles)
    // -------------------------------------------------------------------
    if (iterId > 0 && iterId % 20 === 0) {
      const logoutRes = http.post(`${BASE_URL}/logout`, null, {
        headers: authHeaders,
        tags: { name: 'POST /logout' },
      });
      check(logoutRes, {
        'logout status is 200': (r) => r.status === 200,
      });

      // Revoke token locally so next cycle re-authenticates (simulating logout -> login)
      token = null;
      sleep(1);
    }
  }

  // -------------------------------------------------------------------
  // 6. HEALTH CHECK
  // -------------------------------------------------------------------
  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { name: 'GET /health' },
  });
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
