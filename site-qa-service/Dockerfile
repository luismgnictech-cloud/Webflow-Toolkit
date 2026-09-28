FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

COPY site-qa-service/package*.json ./
RUN npm install --omit=dev

COPY site-qa-service/ ./

ENV NODE_ENV=production
EXPOSE 10000

CMD ["npm", "start"]
