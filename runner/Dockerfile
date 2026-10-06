FROM node:22-alpine
WORKDIR /runner
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js ./
RUN addgroup -S runner && adduser -S runner -G runner && mkdir -p /work && chown -R runner:runner /work /runner
USER runner
ENV NODE_ENV=production
EXPOSE 8090
CMD ["npm","start"]
