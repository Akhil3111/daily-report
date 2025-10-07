FROM ghcr.io/puppeteer/puppeteer:21.6.0
WORKDIR /app

USER root
COPY package*.json ./
RUN npm install
COPY . .

RUN chown -R pptruser:pptruser /app
USER pptruser

ENV NODE_ENV=production
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver
EXPOSE 10000
CMD ["node", "server.js"]
