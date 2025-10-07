2.  **Internal Comments (`#`):** Inside that code block, lines beginning with `#` are standard **comments** that the build system ignores.

When I used the bold text (e.g., **"CRITICAL FIX 1: Grant ownership..."**), those were notes I was adding **outside** the copy-paste-ready code to guide you on *what* the block was doing before you put it into your actual `Dockerfile`.

However, the file you currently have open still contains this issue:

```dockerfile
# CRITICAL FIX 1: Grant ownership of /app to the default user (pptruser)
# This solves the EACCES (permission denied) error during npm install
USER root
RUN chown -R pptruser:pptruser /app
USER pptruser
```

**The Docker engine ignores the `#` lines but executes everything else.**

Since the `EACCES` error is the last hurdle, I will provide the final, absolutely clean `Dockerfile` that eliminates all extra commentary, leaving only the essential, functional commands for the build process.

---

## Final, Clean Dockerfile (EACCES Fix)

This code is ready to be copied and pasted directly into your **`Dockerfile`**. It includes the critical `chown` commands to fix the permission error.

```dockerfile
FROM ghcr.io/puppeteer/puppeteer:21.6.0

# Set up working directory
WORKDIR /app

# --- START CRITICAL PERMISSIONS FIX ---
# Switch to root to change directory ownership
USER root
RUN chown -R pptruser:pptruser /app
# Switch back to the non-root user for security during runtime
USER pptruser
# --- END CRITICAL PERMISSIONS FIX ---

# Copy package.json and install Node dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Set environment variables for driver path
ENV NODE_ENV production
ENV CHROMEDRIVER_PATH /usr/bin/google-chrome

# Expose the port
EXPOSE 10000

# Set the command to run the Express app
CMD ["node", "server.js"]
