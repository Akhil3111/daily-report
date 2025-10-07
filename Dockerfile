FROM ghcr.io/puppeteer/puppeteer:21.6.0

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV production

# CRITICAL: We set this path to the correct location inside the container
ENV CHROMEDRIVER_PATH /usr/bin/google-chrome

EXPOSE 10000

CMD ["node", "server.js"]
