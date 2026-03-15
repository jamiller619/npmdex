FROM node:24-slim
WORKDIR /app
COPY package.json yarn.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
RUN yarn install --frozen-lockfile --production=false
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY tsconfig.base.json ./
EXPOSE 3001
CMD ["yarn", "workspace", "@npmdex/api", "start"]
