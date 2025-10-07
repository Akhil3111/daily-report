# Use the official Node.js base image for Express server
FROM node:20-slim

# Install system dependencies for headless Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    libnss3 \
    libxss1 \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libcups2 \
    libgdk-pixbuf2.0-0 \
    libgbm1 \
    libxkbcommon-x11-0 \
    --no-install-recommends

# Install Google Chrome Stable
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/trusted.gpg.d/google.gpg \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable

# Set up working directory
WORKDIR /app

# Copy package.json and install Node dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Set the critical environment variable for the driver path
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver

# Expose the port (Render will automatically override this)
EXPOSE 10000

# Set the command to run the Express app
CMD ["node", "server.js"]

