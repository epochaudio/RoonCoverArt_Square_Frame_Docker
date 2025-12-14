FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN apk add --no-cache git

RUN npm install

COPY . .

# 确保node用户存在且UID为1000
RUN addgroup -g 1000 node || true && \
    adduser -u 1000 -G node -s /bin/sh -D node || true

# 在构建时创建必要的目录和配置文件
RUN mkdir -p /app/images && \
    touch /app/config.json && \
    echo '{}' > /app/config.json

# 设置正确的所有者和权限
RUN chown -R node:node /app && \
    chmod 755 /app/images && \
    chmod 644 /app/config.json

# 以非root用户运行应用
USER node

EXPOSE 3666

CMD ["npm", "start"] 