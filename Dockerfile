# ChancePing Dockerfile - 阿里云 MVP 测试站容器
# 默认 mock-safe，可由阿里云环境变量显式开启 Qwen / Serper。
# 注意：api.env 必须只留在本地，不能进入 Docker build context。
ARG NODE_IMAGE=node:22-slim

# ===========================================
# Stage 1: Builder（构建阶段）
# ===========================================
FROM ${NODE_IMAGE} AS builder

WORKDIR /app

# 复制 package 文件并安装所有依赖（含 devDependencies）
COPY package*.json ./
RUN npm ci

# 复制源代码
COPY . .

# 类型检查（零错误要求）
RUN npx tsc --noEmit

# ===========================================
# Stage 2: Runtime（运行阶段）
# ===========================================
FROM ${NODE_IMAGE} AS runtime

WORKDIR /app

# 设置生产环境
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_MODE=mock
ENV LLM_MODE=mock
ENV CHANCEPING_LLM_PROFILE=contest
ENV CONTEST_LLM_PROVIDER=qwen
ENV CHANCEPING_LOAD_API_ENV=false
ENV CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=false
ENV CHANCEPING_ENABLE_LOCAL_LIVE_LLM=false
ENV STORE_TYPE=local
ENV SCHEDULER_ENABLED=false
ENV NOTIFY_MOCK_MODE=true
ENV PDF_EXPORT_ENABLED=false
ENV CHANCEPING_RADAR_CHAT_STORE_PATH=data/radar-chat-windows.json

# 复制 package 文件并安装生产依赖
COPY package*.json ./
RUN npm ci --omit=dev && \
    # puppeteer 为可选依赖，运行时按需安装
    # 仅安装 tsx 用于执行 TypeScript
    npm install tsx@^4.19.2 --no-save

# 从 builder 阶段复制源代码与资源
COPY --from=builder /app/src ./src
COPY --from=builder /app/web ./web
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/.env.example ./.env.example

# 创建运行时目录
RUN mkdir -p data reports/export

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# 启动命令
CMD ["npm", "run", "start"]
