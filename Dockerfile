FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
RUN npm ci --workspace=packages/shared --workspace=packages/api
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY tsconfig.base.json ./
EXPOSE 3001
CMD ["npm", "start", "--workspace=packages/api"]
