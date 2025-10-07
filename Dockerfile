FROM ghcr.io/puppeteer/puppeteer:21.6.0

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV production
ENV CHROMEDRIVER_PATH /usr/bin/google-chrome

EXPOSE 10000

CMD ["node", "server.js"]
