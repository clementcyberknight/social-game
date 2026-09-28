// Spins up N users against the deployed app, each acting randomly:
// signup -> login -> feed walk -> view/like/create -> logout.
// Usage: BASE_URL=https://... USERS=10000 CONC=50 bun run load/spin-users.ts
const BASE = process.env.BASE_URL ?? "https://bpo1qoywpjvfg7xosodqdkz5.rocketrush.space";
const USERS = Number(process.env.USERS ?? 10_000);
const CONC = Number(process.env.CONC ?? 50);
const PW = "Loadtest1";
const TAG = Date.now().toString(36);

const lat: number[] = [];
const counts: Record<string, number> = {};
let done = 0;
let failed = 0;

async function req(method: string, path: string, token?: string, body?: unknown) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    await r.text().catch(() => "");
    const ms = performance.now() - t0;
    lat.push(ms);
    counts[`${method} ${path.split("?")[0]}:${r.status}`] =
      (counts[`${method} ${path.split("?")[0]}:${r.status}`] ?? 0) + 1;
    return { status: r.status };
  } catch {
    failed++;
    return { status: 0 };
  } finally {
    clearTimeout(to);
  }
}

async function user(i: number) {
  const email = `spin-${TAG}-${i}@load.test`;
  const s = await req("POST", "/signup", undefined, { email, password: PW });
  if (s.status !== 201) return;
  const l = await fetch(BASE + "/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) as { token?: string } }))
    .catch(() => ({ status: 0, json: {} as { token?: string } }));
  lat.push(0);
  if (l.status !== 200 || !l.json.token) return;
  const token = l.json.token;

  // feed walk (2 pages)
  let cursor = 0;
  for (let p = 0; p < 2; p++) {
    const f = await fetch(
      `${BASE}/posts?limit=20${cursor ? `&cursor=${cursor}` : ""}`,
      { headers: { authorization: `Bearer ${token}` } },
    ).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) as { next_cursor?: number } }))
      .catch(() => ({ status: 0, json: {} as { next_cursor?: number } }));
    if (f.status === 200) cursor = f.json.next_cursor ?? 0;
    else break;
    if (!cursor) break;
  }
  // random: view, like, sometimes create + logout
  const id = 1 + Math.floor(Math.random() * 5000);
  await req("GET", `/posts/${id}`, token);
  const like = await req("POST", `/posts/${id}/like`, token);
  if (like.status === 200 && Math.random() < 0.5) await req("DELETE", `/posts/${id}/like`, token);
  if (Math.random() < 0.3) await req("POST", "/posts", token, { body: `spin ${i} ${Date.now()}` });
  await req("POST", "/logout", token);
}

const t0 = Date.now();
let next = 0;
async function worker() {
  while (true) {
    const i = next++;
    if (i >= USERS) return;
    await user(i);
    done++;
    if (done % 500 === 0) {
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`progress ${done}/${USERS} (${el}s, ${(done / Number(el || 1)).toFixed(0)}/s)`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

lat.sort((a, b) => a - b);
const pct = (p: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))]!.toFixed(0) : "n/a");
console.log(`\nDONE users=${done} failed_net=${failed} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`latency ms: p50=${pct(50)} p95=${pct(95)} p99=${pct(99)} max=${(lat[lat.length - 1] ?? 0).toFixed(0)}`);
console.log("status counts:", JSON.stringify(counts, null, 1));
