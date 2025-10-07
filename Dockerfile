FROM browserless/chrome:latest

# Set up working directory
WORKDIR /app

# The user is 'node' in this image, which has permissions.
# We do not need the complex chown/pptruser fixes.

# Copy package.json and install Node dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Set environment variables for the application
ENV NODE_ENV production
ENV PORT 10000

# The driver path is now explicitly set to the path inside this browserless image
ENV CHROMEDRIVER_PATH /usr/bin/google-chrome

# Expose the port
EXPOSE 10000

# Set the command to run the Express app
CMD ["node", "server.js"]
