export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const unauthorized = () => json({ error: "unauthorized" }, 401);
export const notFound = () => json({ error: "not found" }, 404);
