FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src

RUN chown -R node:node /app

USER node

ENV NODE_ENV=production

CMD ["npm", "start"]
