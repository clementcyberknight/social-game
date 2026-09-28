FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production
COPY src ./src
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s CMD bun -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)})"
CMD ["bun", "run", "src/index.ts"]
